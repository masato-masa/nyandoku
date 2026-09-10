// 生成器の監査。重みやつまみを変えたら必ずこれを回す。
//
// 見るのは 4 点:
//   - 段階 4（他レベルの使い回し）が起きていないか。起きたら重みが厳しすぎる
//   - 段階 2 と 3 が何回起きたか。多いなら目標が現実的でない
//   - 段階 3 で作られた面の難易度。ここは難易度を問わずに作るので、
//     目標から極端に外れた面が混ざっていないかを見る
//   - 生成時間。遅い面がどれくらいあるか
//
//   node scripts/audit-levels.mjs [レベル数]

import { build } from 'esbuild';

const LEVELS = Number.parseInt(process.argv[2] ?? '1000', 10);

const bundled = await build({
  entryPoints: ['src/core/puzzle.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const code = Buffer.from(bundled.outputFiles[0].text).toString('base64');
const { generateForLevel, targetDifficulty, difficultyBand, mulberry32 } = await import(
  `data:text/javascript;base64,${code}`
);

const stages = { 1: 0, 2: 0, 3: 0, 4: 0 };
const stage3 = [];
const stage4 = [];
const slow = [];
const times = [];
const scores = [];
const bands = {};
let unsolved = 0;
let overDepth = 0;

const started = Date.now();
for (let level = 1; level <= LEVELS; level++) {
  const t0 = performance.now();
  const p = generateForLevel(level);
  const ms = performance.now() - t0;

  times.push(ms);
  scores.push(p.difficulty);
  stages[p.stage]++;
  const band = difficultyBand(p.difficulty);
  bands[band] = (bands[band] ?? 0) + 1;

  if (!p.analysis.solved) unsolved++;
  if (p.analysis.maxContradictionDepth > 4) overDepth++;
  if (ms > 3000) slow.push({ level, ms: Math.round(ms) });

  // 段階 3 は難易度を問わずに作るので、目標からどれだけ外れたかを見る
  if (p.stage === 3) {
    const target = targetDifficulty(level, mulberry32(level * 7919 + 104729));
    stage3.push({
      level,
      difficulty: Math.round(p.difficulty),
      target: Math.round(target),
      band,
      size: p.n,
    });
  }
  if (p.stage === 4) stage4.push(level);

  if (level % 200 === 0) {
    process.stdout.write(`  ${level} / ${LEVELS} …\n`);
  }
}

const sorted = [...times].sort((a, b) => a - b);
const ss = [...scores].sort((a, b) => a - b);
const at = (arr, f) => arr[Math.floor(arr.length * f)];
const round = (v) => Math.round(v);

console.log(`\n=== ${LEVELS} レベルの監査 (${((Date.now() - started) / 1000).toFixed(1)} 秒) ===\n`);

console.log('段階の内訳');
console.log(`  1 通常          ${stages[1]}`);
console.log(`  2 条件を緩和    ${stages[2]}`);
console.log(`  3 難易度を問わず ${stages[3]}`);
console.log(`  4 他レベル流用   ${stages[4]}${stages[4] > 0 ? '  ← 発生している。重みが厳しすぎる' : '  ← 発生なし'}`);

console.log('\n難易度');
console.log(`  最小 ${round(ss[0])} / 25% ${round(at(ss, 0.25))} / 中央 ${round(at(ss, 0.5))} / 75% ${round(at(ss, 0.75))} / 最大 ${round(ss[ss.length - 1])}`);
console.log(`  肉球の分布 ${JSON.stringify(bands)}`);

console.log('\n生成時間');
console.log(`  中央 ${round(at(sorted, 0.5))}ms / 90% ${round(at(sorted, 0.9))}ms / 最悪 ${round(sorted[sorted.length - 1])}ms`);
if (slow.length) console.log(`  3 秒超: ${slow.map((x) => `Lv${x.level}(${x.ms}ms)`).join(' ')}`);

console.log('\n健全性');
console.log(`  論理で解けない面 ${unsolved}${unsolved ? '  ← 異常' : ''}`);
console.log(`  背理法が 4 段超  ${overDepth}${overDepth ? '  ← 異常' : ''}`);

if (stage3.length) {
  console.log('\n段階 3 で作られた面（難易度を問わずに作ったもの）');
  for (const x of stage3.slice(0, 20)) {
    const gap = x.difficulty - x.target;
    console.log(
      `  Lv${x.level} ${x.size}x${x.size} 難易度${x.difficulty}（目標${x.target}、差${gap > 0 ? '+' : ''}${gap}）肉球${x.band}`,
    );
  }
  if (stage3.length > 20) console.log(`  …ほか ${stage3.length - 20} 件`);
}
if (stage4.length) console.log(`\n段階 4 が起きたレベル: ${stage4.join(' ')}`);
