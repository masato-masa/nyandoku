import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { CAT, CROSS, type Derived, type GameState, type Mark } from '../core/game';
import { Cat, type Mood } from './Cat';
import { CrossMark } from './icons';

/** この距離を超えて指が動いたらタップではなくドラッグとみなす。
 *  小さすぎると普通のタップが塗りになり、大きすぎると塗り始めが鈍る。 */
const DRAG_THRESHOLD = 7;
const PAD = 16; // .board の padding と一致させる
const GAP = 6; // .board の gap と一致させる

export type PaintMode = 'draw' | 'erase';

interface BoardProps {
  state: GameState;
  derived: Derived;
  onTap: (idx: number) => void;
  /** 塗れたら true を返す。返り値で「何手ぶん動いたか」を数える。 */
  onPaint: (idx: number, mode: PaintMode) => boolean;
  onPaintEnd: (moves: number) => void;
}

export function Board({ state, derived, onTap, onPaint, onPaintEnd }: BoardProps) {
  const { puzzle, marks, rejected, rejectToken, status } = state;
  const n = puzzle.n;

  const boardRef = useRef<HTMLDivElement>(null);
  const origin = useRef<number | null>(null);
  const dragging = useRef(false);
  const mode = useRef<PaintMode>('draw');
  const painted = useRef(new Set<number>());
  const lastPoint = useRef<[number, number] | null>(null);
  const moves = useRef(0);
  const [pressed, setPressed] = useState<number | null>(null);

  const marksRef = useRef(marks);
  marksRef.current = marks;

  /** 画面座標をセル番号に変える。盤の内側なら必ずどこかのセルに当てる。 */
  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right) return null;
      if (clientY < rect.top || clientY > rect.bottom) return null;

      const inner = rect.width - PAD * 2;
      const step = (inner - GAP * (n - 1)) / n + GAP;
      const clamp = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v / step)));
      return clamp(clientY - rect.top - PAD) * n + clamp(clientX - rect.left - PAD);
    },
    [n],
  );

  const paintCell = useCallback(
    (idx: number) => {
      // 同じ指の動きで同じマスを二度塗らない。往復しても暴れないようにする。
      if (painted.current.has(idx)) return;
      painted.current.add(idx);
      if (onPaint(idx, mode.current)) moves.current += 1;
    },
    [onPaint],
  );

  /** 前回の位置から今の位置までを歩きながら塗る。
   *  イベントが飛んでもマスを取りこぼさないための処理で、
   *  これが無いと速くなぞったときだけ穴が空く。 */
  const paintAlong = useCallback(
    (x: number, y: number) => {
      const prev = lastPoint.current;
      lastPoint.current = [x, y];

      if (!prev) {
        const idx = cellFromPoint(x, y);
        if (idx !== null) paintCell(idx);
        return;
      }

      const [px, py] = prev;
      const el = boardRef.current;
      const pitch = el ? (el.getBoundingClientRect().width - PAD * 2 - GAP * (n - 1)) / n : 40;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (pitch * 0.4)));

      for (let s = 1; s <= steps; s++) {
        const idx = cellFromPoint(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps);
        if (idx !== null) paintCell(idx);
      }
    },
    [cellFromPoint, n, paintCell],
  );

  const bind = useDrag(
    ({ xy: [x, y], movement: [mx, my], first, last }) => {
      if (first) {
        const idx = cellFromPoint(x, y);
        origin.current = idx;
        dragging.current = false;
        painted.current.clear();
        lastPoint.current = null;
        moves.current = 0;
        setPressed(idx !== null && !puzzle.wall[idx] ? idx : null);
        return;
      }

      if (last) {
        setPressed(null);
        if (!dragging.current) {
          if (origin.current !== null) onTap(origin.current);
        } else if (moves.current > 1) {
          onPaintEnd(moves.current);
        }
        origin.current = null;
        dragging.current = false;
        lastPoint.current = null;
        return;
      }

      if (!dragging.current && Math.hypot(mx, my) > DRAG_THRESHOLD) {
        dragging.current = true;
        const start = origin.current;
        if (start !== null) {
          // なぞり始めたマスが X なら消しゴム、それ以外なら X を塗る。
          // 指を離すまでこの役割は変わらない。
          mode.current = marksRef.current[start] === CROSS ? 'erase' : 'draw';
          paintCell(start);
        }
        lastPoint.current = [x - mx, y - my];
      }

      if (dragging.current) {
        paintAlong(x, y);
        const idx = cellFromPoint(x, y);
        if (idx !== null) setPressed(puzzle.wall[idx] ? null : idx);
      }
    },
    { pointer: { touch: true }, filterTaps: false },
  );

  const rejectedSet = new Set(rejected);
  const won = status === 'won';
  const mood: Mood = won ? 'happy' : 'idle';

  // クリア時に猫を上から順に跳ねさせるための並び順
  const order = new Map<number, number>();
  let k = 0;
  for (let i = 0; i < marks.length; i++) if (marks[i] === CAT) order.set(i, k++);

  // クリア時、猫のマスを起点に光を広げるための遅れ。
  // 一番近い猫までの距離で決めるので、猫が複数いれば波が複数から出て重なる。
  // クリア条件は「全マスを猫の視界に入れる」なので、その達成の形そのものになる。
  const glow = new Map<number, number>();
  if (won) {
    const cats = [...order.keys()].map((i) => [Math.floor(i / n), i % n] as const);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      let near = Infinity;
      for (const [cr, cc] of cats) near = Math.min(near, Math.hypot(r - cr, c - cc));
      glow.set(i, Number.isFinite(near) ? near * 0.07 : 0);
    }
  }

  return (
    <div
      {...bind()}
      ref={boardRef}
      className="board"
      data-won={won}
      style={{
        gridTemplateColumns: `repeat(${n}, 1fr)`,
        // 行も明示しないと内容の高さで決まってしまい、猫を置いた瞬間に盤面がずれる
        gridTemplateRows: `repeat(${n}, 1fr)`,
        // 壁の数字はセルの大きさに追従させる。盤面が 6x6 から 9x9 まで変わるので
        // 固定 px にすると、大きい盤で数字が窮屈になる。
        fontSize: `calc((min(92vw, 452px) - ${PAD * 2}px - ${GAP * (n - 1)}px) / ${n} * 0.44)`,
      }}
      role="grid"
      aria-label={`${n}×${n} の盤面`}
    >
      {Array.from({ length: n * n }, (_, i) => {
        const num = puzzle.numbers[i];
        const info = derived.numbers.get(i);
        return (
          <Cell
            key={i}
            index={i}
            wall={puzzle.wall[i] === 1}
            number={num >= 0 ? num : null}
            over={info ? info.got > info.want : false}
            done={info ? info.got === info.want : false}
            seen={derived.seen[i] === 1}
            mark={marks[i] as Mark}
            pressed={pressed === i}
            rejected={rejectedSet.has(i)}
            rejectToken={rejectToken}
            won={won}
            mood={mood}
            winOrder={order.get(i) ?? 0}
            glowDelay={glow.get(i) ?? 0}
          />
        );
      })}
    </div>
  );
}

interface CellProps {
  index: number;
  wall: boolean;
  number: number | null;
  over: boolean;
  done: boolean;
  seen: boolean;
  mark: Mark;
  pressed: boolean;
  rejected: boolean;
  rejectToken: number;
  won: boolean;
  mood: Mood;
  winOrder: number;
  /** クリアの光が自分のところへ届くまでの秒数。猫のマスほど早い。 */
  glowDelay: number;
}

const Cell = memo(function Cell({
  index,
  wall,
  number,
  over,
  done,
  seen,
  mark,
  pressed,
  rejected,
  rejectToken,
  won,
  mood,
  winOrder,
  glowDelay,
}: CellProps) {
  // マス本体（はじかれた合図とクリアの光）と猫（跳ね）は別々に動かす。
  // 1 つにまとめると、あとから始めた動きが前の動きを打ち切ってしまう。
  const controls = useAnimationControls();
  const hop = useAnimationControls();

  // 置けないマスを押した。左右に短く振って弾かれたことを伝える。
  useEffect(() => {
    if (!rejected || rejectToken === 0) return;
    void controls.start({
      x: [0, -5, 5, -3.5, 3.5, 0],
      transition: { duration: 0.34, ease: 'easeInOut' },
    });
  }, [rejected, rejectToken, controls]);

  // クリア時、猫が上から順に跳ねる。少し置いてもう一周はしゃぐ。
  useEffect(() => {
    if (!won || mark !== CAT) return;
    void hop.start({
      y: [0, -14, 0],
      transition: {
        delay: winOrder * 0.08,
        duration: 0.5,
        ease: [0.34, 1.56, 0.64, 1],
        repeat: 1,
        repeatDelay: 0.45,
      },
    });
  }, [won, mark, winOrder, hop]);

  // クリア時、猫のマスを起点に光が広がる。壁は光らせない（視界に入る対象ではない）。
  useEffect(() => {
    if (!won || wall) return;
    void controls.start({
      filter: ['brightness(1)', 'brightness(1.3)', 'brightness(1)'],
      scale: [1, 1.07, 1],
      transition: { delay: 0.2 + glowDelay, duration: 0.52, ease: 'easeInOut' },
    });
  }, [won, wall, glowDelay, controls]);

  const className = [
    'cell',
    wall ? 'cell-wall' : 'cell-floor',
    !wall && seen ? 'is-seen' : '',
    !wall && mark === CAT ? 'has-cat' : '',
    over ? 'is-over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      className={className}
      data-pressed={pressed}
      animate={controls}
      role="gridcell"
    >
      {wall && number !== null && (
        <span className="wall-number" data-done={done} data-over={over}>
          {number}
        </span>
      )}

      {!wall && (
        <AnimatePresence initial={false} mode="popLayout">
          {mark === CAT && (
            <motion.span
              key="cat"
              className="mark"
              initial={{ scale: 0, rotate: -22 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 620, damping: 20, mass: 0.7 }}
            >
              <motion.span className="mark-inner" animate={hop}>
                <Cat mood={mood} seed={index} />
              </motion.span>
            </motion.span>
          )}
          {mark === CROSS && (
            <motion.span
              key="cross"
              className="mark"
              initial={{ scale: 0.35, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 760, damping: 28, mass: 0.6 }}
            >
              <CrossMark />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
});
