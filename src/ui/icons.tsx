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

/** 難易度表示の肉球。filled が false のときは薄く出す。 */
export function PawIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="paw" viewBox="0 0 24 24" aria-hidden="true">
      <g fill={filled ? '#B07A86' : '#E4DCD5'}>
        <ellipse cx="7.6" cy="7.2" rx="2.2" ry="2.9" />
        <ellipse cx="16.4" cy="7.2" rx="2.2" ry="2.9" />
        <ellipse cx="3.6" cy="12.6" rx="2" ry="2.5" />
        <ellipse cx="20.4" cy="12.6" rx="2" ry="2.5" />
        <path d="M12 11.6 c3.5 0 6.2 2.7 6.2 5.5 c0 2.2 -1.8 3.3 -3.7 3.3 c-1 0 -1.8 -0.4 -2.5 -0.4 s-1.5 0.4 -2.5 0.4 c-1.9 0 -3.7 -1.1 -3.7 -3.3 c0 -2.8 2.7 -5.5 6.2 -5.5 Z" />
      </g>
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="var(--accent)" />
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

/** ホームへ戻る。ヘッダー左端に置くので、他の丸アイコンと同じ地に合わせる。 */
export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="var(--accent)" />
      <path
        d="M13.6 7.8 L9.4 12 l4.2 4.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 設定。中身は音の入切だけ。
 *  歯は「胴から生えた台形」として 1 本のパスで描く。放射状の細い線で歯を表すと、
 *  22px では太陽のマークに見えてしまう。 */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="var(--accent)" />
      <path
        d="M10.65 7.29 L10.86 5.19 A6.9 6.9 0 0 1 13.14 5.19 L13.35 7.29 A4.9 4.9 0 0 1 14.38 7.71 L16.01 6.38 A6.9 6.9 0 0 1 17.62 7.99 L16.29 9.62 A4.9 4.9 0 0 1 16.71 10.65 L18.81 10.86 A6.9 6.9 0 0 1 18.81 13.14 L16.71 13.35 A4.9 4.9 0 0 1 16.29 14.38 L17.62 16.01 A6.9 6.9 0 0 1 16.01 17.62 L14.38 16.29 A4.9 4.9 0 0 1 13.35 16.71 L13.14 18.81 A6.9 6.9 0 0 1 10.86 18.81 L10.65 16.71 A4.9 4.9 0 0 1 9.62 16.29 L7.99 17.62 A6.9 6.9 0 0 1 6.38 16.01 L7.71 14.38 A4.9 4.9 0 0 1 7.29 13.35 L5.19 13.14 A6.9 6.9 0 0 1 5.19 10.86 L7.29 10.65 A4.9 4.9 0 0 1 7.71 9.62 L6.38 7.99 A6.9 6.9 0 0 1 7.99 6.38 L9.62 7.71 A4.9 4.9 0 0 1 10.65 7.29 Z"
        fill="#fff"
      />
      <circle cx="12" cy="12" r="2.1" fill="var(--accent)" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 15 h14.5 a7.5 7.5 0 0 1 0 15 H15" />
        <path d="M14.5 9 L8 15 L14.5 21" />
      </g>
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M31.5 20 a11.5 11.5 0 1 1 -3.6 -8.4" />
        <path d="M32 9.5 v7 h-7" />
      </g>
    </svg>
  );
}

export function HintIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
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
      <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d="M16.3 30.4 h7.4" />
        <path d="M17.6 34 h4.8" />
      </g>
    </svg>
  );
}
