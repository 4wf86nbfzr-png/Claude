/**
 * Rahmen der Anwendung.
 *
 * Oben die Bühne mit Orb, Namen und Zustand — darunter der jeweilige
 * Bereich. Steht eine Freigabe an, legt sich der Dialog darüber; er ist die
 * einzige Stelle, an der ein Versand ausgelöst werden kann.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { ApprovalOverlay } from './components/ApprovalOverlay'
import { AuditView } from './components/AuditView'
import { CampaignsView } from './components/CampaignsView'
import { ChatView } from './components/ChatView'
import { MemoryView } from './components/MemoryView'
import { Orb } from './components/Orb'
import { SendCenterView } from './components/SendCenterView'
import { SettingsView } from './components/SettingsView'
import { useJarvis } from './hooks/useJarvis'
import { useVoice } from './hooks/useVoice'

type ViewId = 'gespraech' | 'versand' | 'kampagnen' | 'gedaechtnis' | 'protokoll' | 'einstellungen'

const NAV: { id: ViewId; label: string }[] = [
  { id: 'gespraech', label: 'Gespräch' },
  { id: 'versand', label: 'Versandzentrale' },
  { id: 'kampagnen', label: 'Kampagnen' },
  { id: 'gedaechtnis', label: 'Gedächtnis' },
  { id: 'protokoll', label: 'Protokoll' },
  { id: 'einstellungen', label: 'Einstellungen' }
]

export function App(): ReactElement {
  const jarvis = useJarvis()
  const voice = useVoice()
  const [view, setView] = useState<ViewId>('gespraech')
  const [notice, setNotice] = useState<string | null>(null)
  const [editEmailId, setEditEmailId] = useState<number | null>(null)
  const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null)
  const spokenToken = useRef(0)

  useEffect(() => {
    void window.jarvis.system.appInfo().then((info) => setAppInfo({ version: info.version, platform: info.platform }))
  }, [])

  // Antworten vorlesen — jede nur einmal.
  useEffect(() => {
    if (!jarvis.pendingSpeech) return
    if (jarvis.pendingSpeech.token === spokenToken.current) return
    spokenToken.current = jarvis.pendingSpeech.token
    void voice.say(jarvis.pendingSpeech.text)
  }, [jarvis.pendingSpeech, voice])

  const showError = useCallback((message: string, hint?: string) => {
    setNotice(hint ? `${message} — ${hint}` : message)
  }, [])

  useEffect(() => {
    if (jarvis.error) {
      showError(jarvis.error.message, jarvis.error.hint)
      jarvis.dismissError()
    }
  }, [jarvis, showError])

  useEffect(() => {
    if (voice.error) showError(voice.error)
  }, [voice.error, showError])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(timer)
  }, [notice])

  const toggleRecording = useCallback(async () => {
    const text = await voice.toggle()
    if (text) {
      setView('gespraech')
      await jarvis.send(text, true)
    }
  }, [voice, jarvis])

  const pending = jarvis.approvals[0] ?? null
  const stateClass =
    jarvis.state === 'WAITING FOR APPROVAL'
      ? ' stage__state--waiting'
      : jarvis.state === 'ERROR'
        ? ' stage__state--error'
        : ''

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Bereiche">
        <p className="sidebar__brand">Jarvis</p>
        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="nav-item"
            aria-current={view === entry.id}
            onClick={() => setView(entry.id)}
          >
            <span>{entry.label}</span>
            {entry.id === 'versand' && jarvis.approvals.length > 0 ? (
              <span className="nav-item__badge">{jarvis.approvals.length}</span>
            ) : null}
          </button>
        ))}
        <p className="sidebar__foot">
          {appInfo ? `v${appInfo.version} · ${appInfo.platform}` : ''}
          <br />
          Versand nur nach Freigabe
        </p>
      </nav>

      <main className="main">
        <header className="stage">
          <Orb
            state={voice.recording ? 'LISTENING' : voice.speaking ? 'SPEAKING' : jarvis.state}
            level={voice.level}
            onClick={() => void toggleRecording()}
            title={voice.recording ? 'Aufnahme beenden' : 'Sprechen'}
          />
          <h1 className="stage__name">JARVIS</h1>
          <p className={`stage__state${stateClass}`} aria-live="polite">
            {voice.recording ? 'LISTENING' : voice.speaking ? 'SPEAKING' : jarvis.state}
            {jarvis.stateNote ? ` · ${jarvis.stateNote}` : ''}
          </p>
        </header>

        {notice ? (
          <p className="inline-note" style={{ margin: '16px 40px 0' }} role="status">
            {notice}
            <button type="button" className="btn btn--quiet" style={{ marginLeft: 10 }} onClick={() => setNotice(null)}>
              schließen
            </button>
          </p>
        ) : null}

        {view === 'gespraech' ? (
          <ChatView
            turns={jarvis.turns}
            streaming={jarvis.streaming}
            statusMessage={jarvis.statusMessage}
            busy={jarvis.busy}
            recording={voice.recording}
            onSend={(text) => void jarvis.send(text)}
            onToggleRecording={() => void toggleRecording()}
            onCancel={() => void jarvis.cancel()}
          />
        ) : null}

        {view === 'versand' ? (
          <SendCenterView
            dataVersion={jarvis.dataVersion}
            onError={showError}
            onRead={(text) => void voice.say(text)}
            editEmailId={editEmailId}
            onEditHandled={() => setEditEmailId(null)}
          />
        ) : null}

        {view === 'kampagnen' ? (
          <CampaignsView
            dataVersion={jarvis.dataVersion}
            onError={showError}
            onOpenSendCenter={() => setView('versand')}
          />
        ) : null}

        {view === 'gedaechtnis' ? <MemoryView dataVersion={jarvis.dataVersion} onError={showError} /> : null}
        {view === 'protokoll' ? <AuditView dataVersion={jarvis.dataVersion} /> : null}
        {view === 'einstellungen' ? <SettingsView onError={showError} onNotice={setNotice} /> : null}
      </main>

      {pending ? (
        <ApprovalOverlay
          request={pending}
          speaking={voice.speaking}
          onStopReading={voice.stopSpeaking}
          onRead={(text) => void voice.say(text)}
          onEdit={(emailId) => {
            setEditEmailId(emailId)
            setView('versand')
          }}
          onDecide={(decision) => void jarvis.decideApproval(pending.id, decision)}
        />
      ) : null}
    </div>
  )
}
