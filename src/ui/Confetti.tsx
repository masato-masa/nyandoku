import { useMemo } from 'react';
import { motion } from 'motion/react';

/** 盤面と猫から取った色。新しい色は足さない。 */
const COLORS = ['#9179d1', '#f7c95c', '#fbd97e', '#c4685e', '#22c55e'];

const COUNT = 30;

/** 猫が跳ね終わるころに降り始める。数字は App.tsx のクリア演出の時刻表と揃える。 */
const START_DELAY = 1.0;

interface Piece {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  size: number;
  round: boolean;
}

export function Confetti() {
  // 画面の高さは出したときのもので固定する。落ちている途中で変わることはない。
  const fallTo = useMemo(
    () => (typeof window === 'undefined' ? 900 : window.innerHeight + 60),
    [],
  );

  // 降り方は面ごとに変えたいので乱数で作る。位置が毎回同じだと 2 面目で飽きる。
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        left: (i / COUNT) * 100 + (Math.random() - 0.5) * 6,
        delay: START_DELAY + Math.random() * 0.8,
        duration: 1.8 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 140,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 420),
        color: COLORS[i % COLORS.length]!,
        size: 7 + Math.random() * 5,
        round: Math.random() < 0.35,
      })),
    [],
  );

  // 動きを減らす設定の人には出さない。祝いの飾りなので無くても何も困らない。
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.62,
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
          }}
          // 落ちる距離は px で渡す。'vh' のまま渡すと transform として補間されず、
          // 紙吹雪が画面の外に張りついたまま動かない。
          initial={{ y: -60, x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: fallTo, x: p.drift, rotate: p.spin, opacity: [0, 1, 1, 0] }}
          transition={{
            delay: p.delay,
            duration: p.duration,
            ease: 'linear',
            opacity: { delay: p.delay, duration: p.duration, times: [0, 0.06, 0.7, 1] },
          }}
        />
      ))}
    </div>
  );
}
