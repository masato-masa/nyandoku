/// <reference lib="webworker" />
//
// 盤面の生成を別スレッドで行う。
//
// 生成は難しいレベルほど時間がかかり、実測で 4 秒近くかかる面がある。
// メインスレッドで回すとその間ローディングの猫まで止まってしまい、
// 固まったようにしか見えない。ここへ逃がせば画面は動き続ける。

import { generateForLevel, type Puzzle } from './puzzle';

export interface WorkerRequest {
  id: number;
  level: number;
}

export interface WorkerResponse {
  id: number;
  level: number;
  puzzle?: Puzzle;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, level } = e.data;
  try {
    const puzzle = generateForLevel(level);
    const response: WorkerResponse = { id, level, puzzle };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      level,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
