import { useEffect, useState } from 'react';

// 画像は public/cats/ に置いてある。GitHub Pages ではサブパス配信になるので、
// BASE_URL を必ず前置する。ここを '/cats/...' と書くと公開版だけ 404 になる。
const SRC = {
  normal: `${import.meta.env.BASE_URL}cats/normal.png`,
  blink: `${import.meta.env.BASE_URL}cats/blink.png`,
  happy: `${import.meta.env.BASE_URL}cats/happy.png`,
  sad: `${import.meta.env.BASE_URL}cats/sad.png`,
} as const;

// 4 枚とも先に読ませる。まばたきの瞬間に取りに行くと、そこで猫が一瞬消える。
let preloaded = false;
function preload() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const src of Object.values(SRC)) {
    const img = new Image();
    img.src = src;
  }
}

export type Mood = 'idle' | 'happy' | 'sad';

interface CatProps {
  mood?: Mood;
  className?: string;
  /** まばたきの位相をずらす種。盤面上の猫が一斉に瞬くと不自然になる。 */
  seed?: number;
}

export function Cat({ mood = 'idle', className = 'cat-img', seed = 0 }: CatProps) {
  const [blinking, setBlinking] = useState(false);

  useEffect(preload, []);

  useEffect(() => {
    if (mood !== 'idle') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let close = 0;
    let open = 0;

    const schedule = (first: boolean) => {
      // 間隔をばらつかせる。等間隔だと生き物ではなく点滅に見える。
      const wait = first ? 900 + (seed % 5) * 700 : 2600 + Math.random() * 4200;
      close = window.setTimeout(() => {
        setBlinking(true);
        open = window.setTimeout(() => {
          setBlinking(false);
          schedule(false);
        }, 130);
      }, wait);
    };

    schedule(true);
    return () => {
      clearTimeout(close);
      clearTimeout(open);
      setBlinking(false);
    };
  }, [mood, seed]);

  const src =
    mood === 'happy' ? SRC.happy : mood === 'sad' ? SRC.sad : blinking ? SRC.blink : SRC.normal;

  return <img className={className} src={src} alt="" draggable={false} />;
}

export const CAT_NORMAL_SRC = SRC.normal;
