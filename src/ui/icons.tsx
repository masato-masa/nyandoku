// 参考にした画面のアイコンは PNG 素材だが、そのまま持ってくるのは相手の資産なので
// 同じ色調・同じ太さで自前の SVG に描き起こしている。

export function CrossMark() {
  return (
    <svg className="cell-cross" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="4.4" strokeLinecap="round">
        <path d="M6 6 L18 18" />
        <path d="M18 6 L6 18" />
      </g>
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="#9179D1" />
      <path
        d="M9.5 9.3 a2.6 2.6 0 1 1 3.2 2.9 v1.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="12.6" cy="16.6" r="1.25" fill="#fff" />
    </svg>
  );
}

export function LevelsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="#9179D1" />
      <g fill="#fff">
        <rect x="7" y="7.6" width="10" height="2.1" rx="1.05" />
        <rect x="7" y="10.95" width="10" height="2.1" rx="1.05" />
        <rect x="7" y="14.3" width="6.4" height="2.1" rx="1.05" />
      </g>
    </svg>
  );
}

/** 音の入切。歯車だと設定画面と誤解されるので、スピーカーで意味を出す。 */
export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="#9179D1" />
      <path d="M7 10.4 h2.2 L12.4 7.6 v8.8 L9.2 13.6 H7 Z" fill="#fff" />
      {muted ? (
        <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
          <path d="M14.4 10.2 L17.4 13.8" />
          <path d="M17.4 10.2 L14.4 13.8" />
        </g>
      ) : (
        <g fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
          <path d="M14.6 10 a3 3 0 0 1 0 4" />
          <path d="M16.6 8.4 a5.6 5.6 0 0 1 0 7.2" />
        </g>
      )}
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="#8B7ABF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 15 h14.5 a7.5 7.5 0 0 1 0 15 H15" />
        <path d="M14.5 9 L8 15 L14.5 21" />
      </g>
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="#8B7ABF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M31.5 20 a11.5 11.5 0 1 1 -3.6 -8.4" />
        <path d="M32 9.5 v7 h-7" />
      </g>
    </svg>
  );
}

export function HintIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <path
        d="M20 6.5 a9.6 9.6 0 0 1 5.6 17.4 c-1 0.8 -1.6 1.8 -1.7 3 h-7.8 c-0.1 -1.2 -0.7 -2.2 -1.7 -3 A9.6 9.6 0 0 1 20 6.5 Z"
        fill="#F3C55A"
      />
      <path
        d="M20 12.6 a4 4 0 0 0 -3.4 6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <g fill="none" stroke="#8B7ABF" strokeWidth="3.2" strokeLinecap="round">
        <path d="M16.3 30.4 h7.4" />
        <path d="M17.6 34 h4.8" />
      </g>
    </svg>
  );
}
