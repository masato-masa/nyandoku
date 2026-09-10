// 盤面生成の窓口。Worker があればそちらへ、無ければその場で作る。
//
// 生成は決定的なので、同じレベルからは必ず同じ盤面が出る。よって一度作った
// ものは覚えておけばよく、作り直す意味はない。さらに次のレベルを裏で先に
// 作っておけば、「次のレベルへ」を押した瞬間の待ちが消える。

import { generateForLevel, type Puzzle } from './puzzle';
import type { WorkerRequest, WorkerResponse } from './puzzleWorker';

const cache = new Map<number, Puzzle>();
const inFlight = new Map<number, Promise<Puzzle>>();

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const waiting = new Map<number, { resolve: (p: Puzzle) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./puzzleWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, puzzle, error } = e.data;
      const slot = waiting.get(id);
      if (!slot) return;
      waiting.delete(id);
      if (puzzle) slot.resolve(puzzle);
      else slot.reject(new Error(error ?? '盤面の生成に失敗しました'));
    };
    worker.onerror = () => {
      // Worker が使えない環境では、その場で作る方に切り替える。
      // 遅くはなるが遊べなくなるよりよい。
      workerBroken = true;
      for (const [, slot] of waiting) slot.reject(new Error('worker unavailable'));
      waiting.clear();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** すでに作ってあればそれを返す。無ければ null（生成はしない）。 */
export function peekLevel(level: number): Puzzle | null {
  return cache.get(level) ?? null;
}

/** レベルの盤面を得る。作成済みなら即座に返る。 */
export function requestLevel(level: number): Promise<Puzzle> {
  const hit = cache.get(level);
  if (hit) return Promise.resolve(hit);

  const running = inFlight.get(level);
  if (running) return running;

  const w = getWorker();
  const job: Promise<Puzzle> = w
    ? new Promise<Puzzle>((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        const req: WorkerRequest = { id, level };
        w.postMessage(req);
      }).catch(() => generateForLevel(level))
    : Promise.resolve().then(() => generateForLevel(level));

  const tracked = job.then((puzzle) => {
    cache.set(level, puzzle);
    inFlight.delete(level);
    return puzzle;
  });

  inFlight.set(level, tracked);
  return tracked;
}

/**
 * 次に遊ぶであろうレベルを、裏で先に作っておく。
 * 1 面解くのに数分かかるので、その間に作り終わっていれば待ち時間は消える。
 */
export function prefetchLevel(level: number): void {
  if (cache.has(level) || inFlight.has(level)) return;
  void requestLevel(level).catch(() => {
    // 先読みは失敗しても構わない。実際に開くときに作り直される。
  });
}
