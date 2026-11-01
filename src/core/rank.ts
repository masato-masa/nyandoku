// 「ねこ段」。進み具合の節目（ND-5）。
//
// 難易度の点は 40 面あたりから 110〜120 で横ばいになる（生成が届く上限）。
// 肉球を難易度から出している限り、100 面をこえても上がり続ける表示は作れない。
// そこで難しさとは別に、クリアした面の数から段を出し、10 面ごとに段が上がる
// 節目をクリア画面で見せる。無限の面には終わりが無いので、手前に小さな
// ゴールを置く（調査 9「進んでいる感じを別に作る」）。

/** 何面ごとに段が上がるか。 */
export const RANK_SPAN = 10;

export interface RankInfo {
  /** レベル L をクリアした時点の段。1 から始まる。 */
  rank: number;
  /** このクリアで段が上がったか。 */
  rankedUp: boolean;
  /** 次の段まであと何面。 */
  toNext: number;
}

export function rankAfterClear(level: number): RankInfo {
  const rank = Math.floor(level / RANK_SPAN) + 1;
  const into = level % RANK_SPAN;
  return { rank, rankedUp: into === 0, toNext: RANK_SPAN - into };
}
