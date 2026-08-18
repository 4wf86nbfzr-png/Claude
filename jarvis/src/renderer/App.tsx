import { useCallback, useEffect, useState } from 'react';
import type { JarvisError } from '../shared/types.js';
import { useJarvis } from './state/useJarvis.js';
import { useVoice } from './voice/useVoice.js';
import { ConsoleView } from './views/ConsoleView.js';
import { SendDeskView } from './views/SendDeskView.js';
import { CampaignsView } from './views/CampaignsView.js';
import { AuditView } from './views/AuditView.js';
import { SettingsView } from './views/SettingsView.js';

type Tab = 'konsole' | 'versand' | 'kampagnen' | 'protokoll' | 'einrichtung';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'konsole', label: 'Konsole' },
  { id: 'versand', label: 'Versandzentrale' },
  { id: 'kampagnen', label: 'Kampagnen' },
  { id: 'protokoll', label: 'Protokoll' },
  { id: 'einrichtung', label: 'Einrichtung' },
];

export function App(): JSX.Element {
  const { ui, actions, speech, consumeSpeech } = useJarvis();
  const [tab, setTab] = useState<Tab>('konsole');
  const [focusEmailId, setFocusEmailId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<JarvisError | null>(null);

  const voice = useVoice(
    useCallback(
      (utterance: string) => {
        void actions.send(utterance, true);
      },
      [actions],
    ),
  );

  // Everything JARVIS says is read aloud once, unless speech output is off.
  useEffect(() => {
    if (!speech) return;
    void voice.speak(speech.text);
    consumeSpeech();
  }, [speech, voice, consumeSpeech]);

  const openDraft = useCallback((emailId: number) => {
    setFocusEmailId(emailId);
    setTab('versand');
  }, []);

  const requestApproval = useCallback(
    async (emailId: number) => {
      const result = await window.jarvis.emails.requestSend(emailId);
      if (!result.ok) {
        setLocalError(result.error);
        return;
      }
      await actions.refreshApprovals();
      setTab('konsole');
    },
    [actions],
  );

  const error = localError ?? ui.error;

  return (
    <div className="shell">
      <nav className="rail">
        <div className="rail__brand">Jarvis</div>
        <div className="rail__nav">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="rail__link"
              aria-current={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {entry.id === 'konsole' && ui.approvals.length > 0 ? (
                <span className="rail__badge">{ui.approvals.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="rail__foot">
          <button type="button" className="btn btn--quiet btn--small" onClick={() => void actions.newConversation()}>
            Neues Gespräch
          </button>
          <div style={{ marginTop: 10 }}>{ui.state}</div>
        </div>
      </nav>

      <main className="main">
        {tab === 'konsole' ? (
          <ConsoleView
            state={ui.state}
            messages={ui.messages}
            approvals={ui.approvals}
            status={ui.status}
            error={error}
            busy={ui.busy}
            voice={voice}
            onSend={(text) => void actions.send(text)}
            onCancel={actions.cancel}
            onApprove={(id, evidence) => void actions.approve(id, evidence)}
            onReject={(id, evidence) => void actions.reject(id, evidence)}
            onDismissError={() => {
              setLocalError(null);
              actions.dismissError();
            }}
            onOpenDraft={openDraft}
          />
        ) : null}

        {tab === 'versand' ? (
          <SendDeskView
            dataVersion={ui.dataVersion}
            focusEmailId={focusEmailId}
            onFocusHandled={() => setFocusEmailId(null)}
            onSpeak={(text) => void voice.speak(text)}
            onRequestApproval={(emailId) => void requestApproval(emailId)}
            onError={setLocalError}
          />
        ) : null}

        {tab === 'kampagnen' ? (
          <CampaignsView
            dataVersion={ui.dataVersion}
            onError={setLocalError}
            onAsk={(prompt) => {
              setTab('konsole');
              void actions.send(prompt);
            }}
          />
        ) : null}

        {tab === 'protokoll' ? <AuditView dataVersion={ui.dataVersion} onError={setLocalError} /> : null}

        {tab === 'einrichtung' ? <SettingsView onError={setLocalError} /> : null}

        {tab !== 'konsole' && error ? (
          <div className="view">
            <div className="notice notice--error">
              <strong>{error.message}</strong>
              {error.hint ? <div className="muted">{error.hint}</div> : null}
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => {
                  setLocalError(null);
                  actions.dismissError();
                }}
              >
                Ausblenden
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
