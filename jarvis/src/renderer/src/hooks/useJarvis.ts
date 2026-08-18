/**
 * Zustand der Oberfläche.
 *
 * Ein Abonnement auf den Ereignisstrom aus dem Main-Prozess; daraus ergeben
 * sich Gesprächsverlauf, Zustandsanzeige, Statuszeile und offene Freigaben.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApprovalRequest, ChatTurn, JarvisEvent, JarvisState } from '@shared/types'

export interface JarvisStore {
  state: JarvisState
  stateNote: string
  turns: ChatTurn[]
  streaming: string
  statusMessage: string
  approvals: ApprovalRequest[]
  error: { message: string; hint?: string } | null
  dataVersion: number
  send(text: string, spoken?: boolean): Promise<void>
  cancel(): Promise<void>
  decideApproval(id: number, decision: 'freigegeben' | 'abgelehnt'): Promise<void>
  refreshApprovals(): Promise<void>
  dismissError(): void
  busy: boolean
  /** Text, den JARVIS vorlesen möchte (einmalig, danach zurücksetzen). */
  pendingSpeech: { text: string; token: number } | null
}

export function useJarvis(): JarvisStore {
  const [state, setState] = useState<JarvisState>('IDLE')
  const [stateNote, setStateNote] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [streaming, setStreaming] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pendingSpeech, setPendingSpeech] = useState<{ text: string; token: number } | null>(null)
  const speechToken = useRef(0)

  const refreshApprovals = useCallback(async () => {
    const open = await window.jarvis.approvals.list('offen')
    setApprovals(open)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const history = await window.jarvis.chat.history(60)
      if (cancelled) return
      setTurns(
        history
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({
            id: `db-${message.id}`,
            role: message.role as 'user' | 'assistant',
            text: message.content,
            at: message.createdAt
          }))
      )
      await refreshApprovals()
    })()

    const off = window.jarvis.onEvent((event: JarvisEvent) => {
      switch (event.type) {
        case 'state':
          setState(event.state)
          setStateNote(event.note ?? '')
          setBusy(event.state === 'THINKING' || event.state === 'EXECUTING')
          break
        case 'chat':
          setStreaming('')
          setTurns((previous) => [...previous, event.turn])
          break
        case 'chat-delta':
          setStreaming((previous) => previous + event.delta)
          break
        case 'status':
          setStatusMessage(event.message)
          break
        case 'approval':
          setApprovals((previous) =>
            previous.some((a) => a.id === event.request.id) ? previous : [...previous, event.request]
          )
          break
        case 'approval-resolved':
          setApprovals((previous) => previous.filter((a) => a.id !== event.id))
          break
        case 'data-changed':
          setDataVersion((v) => v + 1)
          break
        case 'speak':
          speechToken.current += 1
          setPendingSpeech({ text: event.text, token: speechToken.current })
          break
        case 'error':
          setError({ message: event.message, hint: event.hint })
          break
        default:
          break
      }
    })

    return () => {
      cancelled = true
      off()
    }
  }, [refreshApprovals])

  const send = useCallback(async (text: string, spoken = false) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    setStatusMessage('')
    const result = await window.jarvis.chat.send(trimmed, { spoken })
    if (!result.ok) setError({ message: result.error, hint: result.hint })
    setBusy(false)
  }, [])

  const cancel = useCallback(async () => {
    await window.jarvis.chat.cancel()
    setBusy(false)
    setStreaming('')
  }, [])

  const decideApproval = useCallback(
    async (id: number, decision: 'freigegeben' | 'abgelehnt') => {
      setApprovals((previous) => previous.filter((a) => a.id !== id))
      const result = await window.jarvis.approvals.decide(id, decision)
      if (!result.ok) setError({ message: result.error, hint: result.hint })
      await refreshApprovals()
    },
    [refreshApprovals]
  )

  return {
    state,
    stateNote,
    turns,
    streaming,
    statusMessage,
    approvals,
    error,
    dataVersion,
    send,
    cancel,
    decideApproval,
    refreshApprovals,
    dismissError: () => setError(null),
    busy,
    pendingSpeech
  }
}
