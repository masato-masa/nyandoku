import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { CAT, CROSS, type GameState, type Mark } from '../core/game';
import { CatFace, CrossMark } from './icons';

/** この距離を超えて指が動いたらタップではなくドラッグとみなす。
 *  小さすぎると普通のタップが塗りになり、大きすぎると塗り始めが鈍る。 */
const DRAG_THRESHOLD = 7;
const PAD = 16; // .board の padding と一致させる
const GAP = 6; // .board の gap と一致させる

export type PaintMode = 'draw' | 'erase';

interface BoardProps {
  state: GameState;
  onTap: (idx: number) => void;
  /** 塗れたら true を返す。返り値で「何手ぶん動いたか」を数える。 */
  onPaint: (idx: number, mode: PaintMode) => boolean;
  onPaintEnd: (moves: number) => void;
}

export function Board({ state, onTap, onPaint, onPaintEnd }: BoardProps) {
  const { puzzle, marks, conflicts, conflictToken, status } = state;
  const n = puzzle.n;

  const boardRef = useRef<HTMLDivElement>(null);
  const origin = useRef<number | null>(null);
  const dragging = useRef(false);
  const mode = useRef<PaintMode>('draw');
  const painted = useRef(new Set<number>());
  const lastPoint = useRef<[number, number] | null>(null);
  const moves = useRef(0);
  const [pressed, setPressed] = useState<number | null>(null);

  // ハンドラの中から最新の marks を見るための参照。
  const marksRef = useRef(marks);
  marksRef.current = marks;

  /** 画面座標をセル番号に変える。盤の内側なら必ずどこかのセルに当てる。 */
  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      const inner = rect.width - PAD * 2;
      const step = (inner - GAP * (n - 1)) / n + GAP;
      const clamp = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v / step)));
      const col = clamp(clientX - rect.left - PAD);
      const row = clamp(clientY - rect.top - PAD);
      return row * n + col;
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
   *  イベントが飛んでもマスを取りこぼさないようにするための処理で、
   *  ここが無いと速くなぞったときだけ穴が空く。 */
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
      const pitch = el
        ? (el.getBoundingClientRect().width - PAD * 2 - GAP * (n - 1)) / n
        : 40;
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
        setPressed(idx);
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
        if (idx !== null) setPressed(idx);
      }
    },
    { pointer: { touch: true }, filterTaps: false },
  );

  const conflictSet = new Set(conflicts);
  const won = status === 'won';

  // 勝ったとき、猫を上から順に跳ねさせるための並び順
  const catOrder = new Map<number, number>();
  let order = 0;
  for (let i = 0; i < marks.length; i++) if (marks[i] === CAT) catOrder.set(i, order++);

  return (
    <div
      {...bind()}
      ref={boardRef}
      className="board"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      role="grid"
      aria-label={`${n}×${n} の盤面`}
    >
      {Array.from({ length: n * n }, (_, i) => (
        <Cell
          key={i}
          index={i}
          region={puzzle.regions[i]}
          mark={marks[i] as Mark}
          pressed={pressed === i}
          conflict={conflictSet.has(i)}
          conflictToken={conflictToken}
          won={won}
          winOrder={catOrder.get(i) ?? 0}
        />
      ))}
    </div>
  );
}

interface CellProps {
  index: number;
  region: number;
  mark: Mark;
  pressed: boolean;
  conflict: boolean;
  conflictToken: number;
  won: boolean;
  winOrder: number;
}

const Cell = memo(function Cell({
  index,
  region,
  mark,
  pressed,
  conflict,
  conflictToken,
  won,
  winOrder,
}: CellProps) {
  const controls = useAnimationControls();

  // ルール違反。左右に短く振る。振幅を減衰させると「弾かれた」感じになる。
  useEffect(() => {
    if (!conflict || conflictToken === 0) return;
    void controls.start({
      x: [0, -5, 5, -3.5, 3.5, 0],
      transition: { duration: 0.34, ease: 'easeInOut' },
    });
  }, [conflict, conflictToken, controls]);

  // クリア時、猫が上から順に跳ねる。
  useEffect(() => {
    if (!won || mark !== CAT) return;
    void controls.start({
      y: [0, -13, 0],
      transition: { delay: winOrder * 0.08, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
    });
  }, [won, mark, winOrder, controls]);

  return (
    <motion.div
      className="cell"
      data-pressed={pressed}
      animate={controls}
      style={{ background: `var(--r${region % 9})` }}
      role="gridcell"
    >
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
            <CatFace blinkDelay={(index % 7) * 0.8} />
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
    </motion.div>
  );
});
