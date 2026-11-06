// 「面白さ」の観点で面を測る常設の監査ツール。解を使って機械的に測れる分だけを見る。
//
// 観点は Vault の Knowledge/game-fun.md（調査 1〜39）に基づく。
//   F1 立ち上がり   最初の 15 面（「始めて 2 時間以内に続けるか決まる」窓）が易しく、
//                    新しい技法が 1 つずつ出るか
//   F2 山と谷       難易度が急に跳ねる面（離脱の山）と、一息つける易しい面の割合
//   F3 技法の初出   各技法が初めて出る面。出ない・遅すぎる・一度に複数出るは教え方の穴
//   F4 ひらめき     背理法（Aha の面）が 10 面窓で何割か。0 が続く／毎回は単調
//   F5 マンネリ     隣り合う面で盤の大きさ・技法の組が同じ割合（イベントのマンネリ化の類比）
//
//   node scripts/audit-fun.mjs [レベル数]

import { build } from 'esbuild';

const LEVELS = Number.parseInt(process.argv[2] ?? '300', 10);

const bundled = await build({
  entryPoints: ['src/core/puzzle.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const code = Buffer.from(bundled.outputFiles[0].text).toString('base64');
const { generateForLevel } = await import(`data:text/javascript;base64,${code}`);

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

/** 面ごとの特徴 */
const rows = [];
for (let level = 1; level <= LEVELS; level++) {
  const p = generateForLevel(level);
  const a = p.analysis;
  const tech = [];
  if (a.byCover > 0) tech.push('被覆');
  if (a.bySubset > 0) tech.push('集合');
  if (a.contradictions.length > 0) tech.push('背理' + Math.max(...a.contradictions.map((c) => c.depth)));
  rows.push({
    level,
    n: p.n,
    diff: p.difficulty,
    chain: a.chainDepth,
    cand: a.candidates,
    tech: tech.join('+') || '数字のみ',
    hasCover: a.byCover > 0,
    hasSubset: a.bySubset > 0,
    hasContra: a.contradictions.length > 0,
    contraDepth: a.contradictions.length ? Math.max(...a.contradictions.map((c) => c.depth)) : 0,
    contraWidth: a.contradictions.length ? Math.max(...a.contradictions.map((c) => c.branchWidth)) : 0,
  });
}

console.log(`\n=== 面白さの監査（1〜${LEVELS} 面）===`);

// F1 立ち上がり
console.log('\n[F1] 最初の 15 面');
console.log('面  盤  難易度  連鎖  技法');
for (const r of rows.slice(0, 15)) {
  console.log(
    `${String(r.level).padStart(2)}  ${r.n}x${r.n}  ${String(Math.round(r.diff)).padStart(5)}  ${String(r.chain).padStart(4)}  ${r.tech}`,
  );
}
const first15 = rows.slice(0, 15);
console.log(
  `  最初の 15 面: 難易度の中央 ${Math.round(median(first15.map((r) => r.diff)))}、最大 ${Math.round(Math.max(...first15.map((r) => r.diff)))}、` +
    `被覆を使う面 ${first15.filter((r) => r.hasCover).length}、集合 ${first15.filter((r) => r.hasSubset).length}、背理法 ${first15.filter((r) => r.hasContra).length}`,
);

// F2 山と谷
let spikes = 0;
let reliefs = 0;
const spikeList = [];
for (let i = 5; i < rows.length; i++) {
  const prior = median(rows.slice(i - 5, i).map((r) => r.diff));
  if (rows[i].diff > prior * 1.5) {
    spikes++;
    if (spikeList.length < 8) spikeList.push(`Lv${rows[i].level}(${Math.round(rows[i].diff)} / 直前 5 面の中央 ${Math.round(prior)})`);
  }
  if (rows[i].diff < prior * 0.7) reliefs++;
}
const body = rows.length - 5;
console.log('\n[F2] 山と谷（直前 5 面の中央値との比）');
console.log(`  山（1.5 倍超）: ${spikes} 面 = ${pct(spikes / body)}   例: ${spikeList.join(', ') || 'なし'}`);
console.log(`  谷（0.7 倍未満）: ${reliefs} 面 = ${pct(reliefs / body)}`);

// F3 技法の初出
console.log('\n[F3] 技法の初出');
const firstSeen = {};
for (const r of rows) {
  for (const t of r.tech.split('+')) if (!(t in firstSeen)) firstSeen[t] = r.level;
}
console.log('  ' + Object.entries(firstSeen).map(([t, l]) => `${t}: Lv${l}`).join('、'));
const kinds = Object.keys(firstSeen).length;
console.log(`  出た技法の種類: ${kinds}`);

// F4 ひらめき（背理法）
console.log('\n[F4] 背理法を使う面（10 面ごと）');
const windows = [];
for (let s = 0; s < rows.length; s += 10) {
  const w = rows.slice(s, s + 10);
  windows.push(w.filter((r) => r.hasContra).length);
}
console.log('  ' + windows.map((c) => String(c)).join(' '));
const zeroRuns = (() => {
  let best = 0;
  let cur = 0;
  for (const c of windows) {
    cur = c === 0 ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
})();
console.log(`  全体 ${pct(rows.filter((r) => r.hasContra).length / rows.length)}、背理法ゼロの窓が続く最長 ${zeroRuns} 窓（= ${zeroRuns * 10} 面）`);

// F5 マンネリ
let same = 0;
for (let i = 1; i < rows.length; i++) {
  if (rows[i].n === rows[i - 1].n && rows[i].tech === rows[i - 1].tech) same++;
}
console.log('\n[F5] 隣り合う面で盤の大きさ・技法の組が同じ割合');
console.log(`  ${pct(same / (rows.length - 1))}（${same} / ${rows.length - 1}）`);
const bySize = {};
for (const r of rows) bySize[r.n] = (bySize[r.n] ?? 0) + 1;
console.log('  盤の大きさ別: ' + Object.entries(bySize).map(([n, c]) => `${n}x${n}:${c}`).join(' '));

// 難易度の曲線（20 面ごとの中央値）
console.log('\n[曲線] 20 面ごとの難易度の中央値');
const curve = [];
for (let s = 0; s < rows.length; s += 20) curve.push(Math.round(median(rows.slice(s, s + 20).map((r) => r.diff))));
console.log('  ' + curve.join(' '));
