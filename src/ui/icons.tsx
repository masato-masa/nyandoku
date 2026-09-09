interface CatProps {
  /** 瞬きの位相をずらすための遅延（秒）。猫が一斉に瞬くと不自然になる。 */
  blinkDelay?: number;
}

export function CatFace({ blinkDelay = 0 }: CatProps) {
  return (
    <svg className="cell-cat" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M15 27 L16.5 9 L32 20 Z" fill="#A0876F" />
      <path d="M49 27 L47.5 9 L32 20 Z" fill="#A0876F" />
      <path d="M19 25 L20 14 L29 20.5 Z" fill="#F0B6C4" />
      <path d="M45 25 L44 14 L35 20.5 Z" fill="#F0B6C4" />
      <ellipse cx="32" cy="36.5" rx="21" ry="18.5" fill="#BFA890" />
      <g stroke="#93795F" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M32 19.5 v7.5" />
        <path d="M24.5 21.5 l2.2 6.6" />
        <path d="M39.5 21.5 l-2.2 6.6" />
      </g>
      <ellipse cx="32" cy="43.5" rx="12.5" ry="8" fill="#F3EAE0" />
      <g className="cat-eyes" style={{ animationDelay: `${blinkDelay}s` }}>
        <ellipse cx="23.8" cy="34.5" rx="4.1" ry="4.8" fill="#3F3229" />
        <ellipse cx="40.2" cy="34.5" rx="4.1" ry="4.8" fill="#3F3229" />
        <circle cx="25.3" cy="32.8" r="1.35" fill="#fff" />
        <circle cx="41.7" cy="32.8" r="1.35" fill="#fff" />
      </g>
      <path d="M32 40.2 l3.1 2.5 -3.1 2.3 -3.1 -2.3 Z" fill="#E28FA5" />
      <g stroke="#93795F" strokeWidth="1.7" fill="none" strokeLinecap="round">
        <path d="M32 45 q-3.1 3 -6 0.4" />
        <path d="M32 45 q3.1 3 6 0.4" />
      </g>
      <g stroke="#93795F" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
        <path d="M18.5 40 h-9.5" />
        <path d="M18.5 44 l-9 3" />
        <path d="M45.5 40 h9.5" />
        <path d="M45.5 44 l9 3" />
      </g>
    </svg>
  );
}

export function CrossMark() {
  return (
    <svg className="cell-cross" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <path d="M5 5 L19 19" />
        <path d="M19 5 L5 19" />
      </g>
    </svg>
  );
}

export function Heart({ filled }: { filled: boolean }) {
  return (
    <svg className="heart" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.4 C6.6 16.6 3 13.6 3 9.9 A4.6 4.6 0 0 1 12 7.6 A4.6 4.6 0 0 1 21 9.9 C21 13.6 17.4 16.6 12 20.4 Z"
        fill={filled ? '#E8798E' : '#E9E2DC'}
      />
    </svg>
  );
}

export function PawIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        <ellipse cx="8" cy="7.4" rx="2.1" ry="2.7" />
        <ellipse cx="16" cy="7.4" rx="2.1" ry="2.7" />
        <ellipse cx="3.9" cy="12.4" rx="1.9" ry="2.4" />
        <ellipse cx="20.1" cy="12.4" rx="1.9" ry="2.4" />
        <path d="M12 11.4 c3.4 0 6 2.6 6 5.3 c0 2.1 -1.7 3.2 -3.6 3.2 c-1 0 -1.7 -0.4 -2.4 -0.4 s-1.4 0.4 -2.4 0.4 C7.7 19.9 6 18.8 6 16.7 C6 14 8.6 11.4 12 11.4 Z" />
      </g>
    </svg>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function UndoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 8 h9.5 a5.5 5.5 0 0 1 0 11 H8" />
      <path d="M7.5 4 L3.6 8 L7.5 12" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M20 12 a8 8 0 1 1 -2.6 -5.9" />
      <path d="M20.4 4.2 v4.4 h-4.4" />
    </svg>
  );
}

export function HintIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M9.3 17.5 a6.2 6.2 0 1 1 5.4 0" />
      <path d="M9.5 20.4 h5" />
      <path d="M10.2 17.5 v2.9" />
      <path d="M13.8 17.5 v2.9" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2 a2.7 2.7 0 1 1 3.4 3 v1.4" />
      <path d="M12.8 17.3 h0.01" strokeWidth="2.4" />
    </svg>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 9.4 h3.4 L12 5.4 v13.2 L7.4 14.6 H4 Z" />
      {muted ? (
        <>
          <path d="M16.2 9.6 L20.4 14.4" />
          <path d="M20.4 9.6 L16.2 14.4" />
        </>
      ) : (
        <>
          <path d="M15.8 9.6 a3.6 3.6 0 0 1 0 4.8" />
          <path d="M18.4 7.2 a7 7 0 0 1 0 9.6" />
        </>
      )}
    </svg>
  );
}
