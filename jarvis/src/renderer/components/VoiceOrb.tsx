import type { AssistantState } from '../../shared/types.js';

interface Props {
  state: AssistantState;
  listening: boolean;
  level: number;
  onToggle(): void;
  disabled?: boolean;
}

const BAR_COUNT = 24;

/**
 * The one moving element in the interface. At rest it is a thin ring; while
 * listening it breathes and the bars follow the microphone level. Nothing
 * animates when nothing is happening.
 */
export function VoiceOrb({ state, listening, level, onToggle, disabled }: Props): JSX.Element {
  const active = listening || state === 'THINKING' || state === 'EXECUTING' || state === 'SPEAKING';
  const amplitude = listening ? Math.min(1, level * 2.4) : active ? 0.24 : 0;

  return (
    <button
      type="button"
      className="orb"
      data-active={active}
      onClick={onToggle}
      disabled={disabled}
      aria-label={listening ? 'Zuhören beenden' : 'Sprachaufnahme starten'}
      title={listening ? 'Zuhören beenden' : 'Sprachaufnahme starten (Leertaste)'}
    >
      <span className="orb__ring" aria-hidden="true" />
      {/* At rest the orb is a ring and a dot. The bars exist only while
          something is actually happening. */}
      <span className="orb__bars" aria-hidden="true">
        {(active ? Array.from({ length: BAR_COUNT }) : []).map((_, index) => {
          const angle = (index / BAR_COUNT) * 360;
          // A stable pseudo-random weight per bar keeps the shape organic
          // without any per-frame randomness.
          const weight = 0.45 + 0.55 * Math.abs(Math.sin(index * 1.7));
          const height = 6 + amplitude * 34 * weight;
          return (
            <span
              key={index}
              className="orb__bar"
              style={{
                height: `${height}px`,
                transform: `rotate(${angle}deg) translateY(-52px)`,
                opacity: 0.25 + amplitude * 0.75 * weight,
              }}
            />
          );
        })}
      </span>
      <span className="orb__core" style={{ transform: `scale(${1 + amplitude * 1.6})` }} aria-hidden="true" />
    </button>
  );
}
