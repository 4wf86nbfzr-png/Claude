/**
 * JarvisCore.
 *
 * Nimmt die Eingabe entgegen, entscheidet, welche Werkzeuge gebraucht werden,
 * führt die Schleife aus und meldet den Zustand an die Oberfläche.
 *
 * Zwei Dinge macht der Kern selbst, ohne das Sprachmodell zu fragen:
 *   1. Freigaben. Sagt der Nutzer "senden" oder "ja", während eine Anfrage
 *      offen ist, wird sie hier entschieden. Das Modell könnte das Wort
 *      sonst übergehen oder umdeuten.
 *   2. Abbruch. "Stopp" beendet den laufenden Durchgang sofort.
 */
import { randomUUID } from 'node:crypto'
import {
  appendMessage,
  createConversation,
  latestConversationId,
  listMemory,
  listMessages
} from '../db/repos/system'
import { getLlm, type LlmMessage } from '../llm'
import { LlmConfigError } from '../llm/types'
import { decide, interpretApprovalUtterance, pendingApprovals } from '../services/approval'
import { auditInfo, auditWarn } from '../services/audit'
import { emit, setState, status } from '../services/events'
import { getSettings } from '../services/settings'
import { executeTool, summarize, toolDefinitions } from '../tools/registry'
import type { ChatTurn, ToolResult } from '@shared/types'

const MAX_STEPS = 14

let activeController: AbortController | null = null
let conversationId: number | null = null

export function currentConversationId(): number {
  if (conversationId === null) {
    conversationId = latestConversationId() ?? createConversation('Erstes Gespräch')
  }
  return conversationId
}

export function startNewConversation(): number {
  conversationId = createConversation(`Gespräch vom ${new Date().toLocaleString('de-DE')}`)
  return conversationId
}

export function cancelCurrentRun(): void {
  activeController?.abort()
  activeController = null
  setState('IDLE', 'abgebrochen')
}

// ---------------------------------------------------------------------------
// Systemanweisung
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const settings = getSettings()
  const preferences = listMemory('user_preference')
  const open = pendingApprovals()

  const lines: string[] = [
    'Du bist JARVIS, der persönliche Assistent auf dem Rechner des Nutzers.',
    'Du sprichst Deutsch, in der Sie-Form, knapp und sachlich. Keine Floskeln, kein Werbeton.',
    'Deine Antworten werden vorgelesen — schreibe deshalb so, wie man es sagen würde: kurze Sätze,',
    'keine Aufzählungszeichen, keine Formatierungszeichen, keine Emojis.',
    '',
    'ARBEITSWEISE',
    '- Du behauptest nie, etwas getan zu haben. Du tust es über ein Werkzeug und berichtest dessen Ergebnis.',
    '- Meldet ein Werkzeug einen Fehler, sagst du das offen und nennst die Ursache. Kein beschönigtes "hat geklappt".',
    '- Du erfindest keine Firmendaten, keine Adressen und keine Ansprechpartner. Was nicht in einem',
    '  Werkzeugergebnis steht, existiert für dich nicht.',
    '- Du trennst Fakt und Einschätzung. Fakten belegst du mit der Quelle aus der Recherche.',
    '  Eigene Schlüsse kennzeichnest du als Einschätzung.',
    '- Bei längeren Aufgaben sagst du zwischendurch, woran du gerade bist.',
    '',
    'FREIGABEN — DIE WICHTIGSTE REGEL',
    '- Du versendest niemals selbst eine E-Mail. "send_email" beantragt nur den Versand.',
    '- Nach dem Beantragen nennst du Empfänger, Betreff und fragst wörtlich, ob freigegeben werden soll.',
    '- Du wartest auf eine eindeutige Antwort. "Ja, aber ..." ist keine Freigabe, sondern ein Aenderungswunsch.',
    '- Dasselbe gilt für Löschen, Ueberschreiben, Installationen und alles, was nach außen geht.',
    '',
    'WERKZEUGE',
    '- Firmensuche: research_companies. Einzelne Website auslesen: extract_company_information.',
    '- Akquise vorbereiten: create_campaign und run_campaign, oder prepare_outreach_draft je Firma.',
    '- Uebersicht: list_send_center. Entwürfe: list_email_drafts, read_email_draft, update_email_draft.',
    '- Vor einem Erstkontakt prüfst du mit get_company, ob die Firma schon angeschrieben wurde.',
    '',
    `Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
  ]

  if (settings.outreach.senderCompany) {
    lines.push(`Der Nutzer arbeitet für: ${settings.outreach.senderCompany}.`)
  }
  if (settings.outreach.senderService) {
    lines.push(`Angebotene Leistungen: ${settings.outreach.senderService}.`)
  }
  if (settings.outreach.requireVerifiedAddress) {
    lines.push('Es dürfen nur als VERIFIZIERT eingestufte Adressen angeschrieben werden.')
  }
  lines.push(
    `Versandgrenzen: höchstens ${settings.outreach.dailySendLimit} Mails in 24 Stunden, ` +
      `mindestens ${settings.outreach.minSecondsBetweenSends} Sekunden Abstand.`
  )

  if (preferences.length > 0) {
    lines.push('', 'GEMERKTE VORGABEN DES NUTZERS')
    for (const fact of preferences.slice(0, 20)) lines.push(`- ${fact.key}: ${fact.value}`)
  }

  if (open.length > 0) {
    lines.push('', 'OFFENE FREIGABEN')
    for (const approval of open.slice(0, 10)) {
      lines.push(`- #${approval.id}: ${approval.title}`)
    }
    lines.push('Wenn der Nutzer zustimmt, sagt das die Anwendung dir — du führst nichts selbst aus.')
  }

  return lines.join('\n')
}

/** Holt den bisherigen Gesprächsverlauf als Nachrichtenliste für das Modell. */
function historyMessages(limit = 24): LlmMessage[] {
  return listMessages(currentConversationId(), limit)
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: [{ type: 'text' as const, text: message.content }]
    }))
}

// ---------------------------------------------------------------------------
// Eingabe verarbeiten
// ---------------------------------------------------------------------------

function pushTurn(role: ChatTurn['role'], text: string, extra: Partial<ChatTurn> = {}): ChatTurn {
  const turn: ChatTurn = { id: randomUUID(), role, text, at: new Date().toISOString(), ...extra }
  emit({ type: 'chat', turn })
  return turn
}

/**
 * Fängt Freigabe- und Abbruchworte ab, bevor das Sprachmodell ins Spiel kommt.
 * Rückgabe true bedeutet: die Eingabe ist erledigt.
 */
async function handleControlUtterance(text: string): Promise<boolean> {
  if (/^\s*(stopp?|abbrechen|halt|warte)\s*[.!]?\s*$/i.test(text)) {
    cancelCurrentRun()
    pushTurn('assistant', 'Abgebrochen.')
    return true
  }

  const open = pendingApprovals()
  if (open.length === 0) return false

  const verdict = interpretApprovalUtterance(text)
  if (verdict === 'unklar') return false

  // Bei mehreren offenen Anfragen nicht raten.
  if (open.length > 1 && !/#\d+/.test(text)) {
    pushTurn(
      'assistant',
      `Es sind ${open.length} Freigaben offen: ${open.map((a) => `#${a.id} ${a.title}`).join('; ')}. ` +
        'Welche davon meinen Sie? Bitte mit der Nummer antworten.'
    )
    return true
  }

  const explicit = /#(\d+)/.exec(text)
  const target = explicit ? open.find((a) => a.id === Number(explicit[1])) : open[0]
  if (!target) {
    pushTurn('assistant', `Zu #${explicit?.[1]} ist keine Freigabe offen.`)
    return true
  }

  if (verdict === 'ablehnung') {
    await decide(target.id, 'abgelehnt', text)
    pushTurn('assistant', `In Ordnung, ${target.title} wurde nicht ausgeführt.`)
    return true
  }

  setState('EXECUTING', target.title)
  const outcome = await decide(target.id, 'freigegeben', text)

  if (!outcome.ok) {
    pushTurn('assistant', `Das hat nicht funktioniert: ${outcome.error}`)
    setState('ERROR', outcome.error)
    return true
  }

  const result = outcome.data.result
  if (!result) {
    pushTurn('assistant', `${target.title}: freigegeben.`)
  } else if (result.ok) {
    pushTurn('assistant', result.note ?? `${target.title}: erledigt.`)
  } else {
    pushTurn('assistant', `${target.title} ist fehlgeschlagen: ${result.error}${result.hint ? ` ${result.hint}` : ''}`)
  }

  setState('IDLE')
  return true
}

export interface HandleOptions {
  spoken?: boolean
}

/**
 * Verarbeitet eine Nutzereingabe vollständig: Freigabe prüfen, sonst die
 * Werkzeugschleife fahren.
 */
export async function handleUserMessage(text: string, options: HandleOptions = {}): Promise<ToolResult<{ reply: string }>> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Es kam keine Eingabe an.' }

  const convo = currentConversationId()
  appendMessage({ conversationId: convo, role: 'user', content: trimmed })
  pushTurn('user', trimmed)
  auditInfo('nutzer', options.spoken ? 'Sprachbefehl' : 'Eingabe', trimmed.slice(0, 300))

  if (await handleControlUtterance(trimmed)) {
    return { ok: true, data: { reply: 'erledigt' } }
  }

  const controller = new AbortController()
  activeController = controller

  let llm
  try {
    llm = getLlm()
  } catch (err) {
    const message = err instanceof LlmConfigError ? err.message : String(err)
    const hint = err instanceof LlmConfigError ? err.hint : undefined
    setState('ERROR', message)
    emit({ type: 'error', message, hint })
    pushTurn('assistant', `${message}${hint ? ` ${hint}` : ''}`)
    return { ok: false, error: message, hint }
  }

  const settings = getSettings()
  const system = buildSystemPrompt()
  const messages: LlmMessage[] = [
    ...historyMessages(),
    { role: 'user', content: [{ type: 'text', text: trimmed }] }
  ]

  const toolSummaries: { name: string; ok: boolean; summary: string }[] = []
  let finalText = ''

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (controller.signal.aborted) break

      setState(step === 0 ? 'THINKING' : 'EXECUTING')
      const streamId = randomUUID()
      let streamed = false

      const response = await llm.complete({
        system,
        messages,
        tools: toolDefinitions(),
        maxTokens: settings.llm.maxTokens,
        signal: controller.signal,
        onTextDelta: (delta) => {
          streamed = true
          emit({ type: 'chat-delta', id: streamId, delta })
        }
      })

      messages.push({ role: 'assistant', content: [{ type: 'text', text: response.text }], raw: response.raw })

      if (response.toolCalls.length === 0) {
        finalText = response.text.trim()
        void streamed
        break
      }

      setState('EXECUTING')
      const results: LlmMessage['content'] = []

      for (const call of response.toolCalls) {
        status(`Werkzeug: ${call.name}`)
        const result = await executeTool(call.name, call.input, {
          actor: 'JarvisCore',
          conversationId: convo,
          signal: controller.signal,
          say: (message) => status(message)
        })

        toolSummaries.push({ name: call.name, ok: result.ok, summary: summarize(result) })
        appendMessage({
          conversationId: convo,
          role: 'tool',
          content: JSON.stringify({ tool: call.name, result }).slice(0, 8000),
          toolName: call.name
        })

        results.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: JSON.stringify(result).slice(0, 60_000),
          isError: !result.ok
        })
      }

      messages.push({ role: 'user', content: results })

      if (step === MAX_STEPS - 1) {
        finalText =
          response.text.trim() ||
          'Ich habe die Schrittgrenze erreicht. Sagen Sie mir bitte, womit ich weitermachen soll.'
        auditWarn('JarvisCore', 'Schrittgrenze erreicht', `${MAX_STEPS} Schritte für: ${trimmed.slice(0, 120)}`)
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      setState('IDLE', 'abgebrochen')
      return { ok: true, data: { reply: 'abgebrochen' } }
    }
    const message = err instanceof Error ? err.message : String(err)
    setState('ERROR', message)
    emit({ type: 'error', message })
    pushTurn('assistant', `Da ist etwas schiefgegangen: ${message}`)
    appendMessage({ conversationId: convo, role: 'assistant', content: `Fehler: ${message}` })
    return { ok: false, error: message }
  } finally {
    activeController = null
  }

  if (!finalText) finalText = 'Ich bin fertig.'

  appendMessage({ conversationId: convo, role: 'assistant', content: finalText })
  pushTurn('assistant', finalText, {
    agent: 'JarvisCore',
    toolCalls: toolSummaries.length > 0 ? toolSummaries : undefined
  })

  // Steht eine Freigabe an, bleibt der Zustand sichtbar stehen.
  setState(pendingApprovals().length > 0 ? 'WAITING FOR APPROVAL' : 'IDLE')

  if (getSettings().tts.enabled) {
    emit({ type: 'speak', text: finalText })
  }

  return { ok: true, data: { reply: finalText } }
}
