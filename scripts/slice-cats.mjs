// ChatGPT に描かせた 2x2 の猫グリッドを、表情ごとの PNG に切り出す。
//
// 生成物は目分量で並んでいるので、四等分しただけでは猫の位置も大きさも揃わない。
// そこで各象限をアルファの外接矩形で切り直し、4 枚に共通の縮尺をかけてから
// 透明な正方形の中央に置く。こうしないと表情を切り替えた瞬間に猫が伸縮する。

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src/cats-grid.png';
const OUT = 'public/cats';
const SIZE = 256; // 盤面のセルは最大でも 110px 前後。2 倍解像度で足りる。
const NAMES = ['normal', 'blink', 'happy', 'sad']; // 左上→右上→左下→右下

mkdirSync(OUT, { recursive: true });

const meta = await sharp(SRC).metadata();
const half = { w: Math.floor(meta.width / 2), h: Math.floor(meta.height / 2) };
console.log(`元画像 ${meta.width}x${meta.height}`);

// 1 周目: 各象限をアルファで切り詰めて、素の大きさを測る
const parts = [];
for (let i = 0; i < 4; i++) {
  const quadrant = await sharp(SRC)
    .extract({ left: (i % 2) * half.w, top: Math.floor(i / 2) * half.h, width: half.w, height: half.h })
    .ensureAlpha()
    .toBuffer();

  const { data, info } = await sharp(quadrant)
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });

  parts.push({ name: NAMES[i], data, w: info.width, h: info.height });
}

// 一番大きい猫が余白を少し残して収まる倍率を、4 枚で共有する
const largest = Math.max(...parts.flatMap((p) => [p.w, p.h]));
const scale = (SIZE * 0.96) / largest;

// 2 周目: 共通倍率で縮めて、透明な正方形の中央へ置く
for (const p of parts) {
  const w = Math.round(p.w * scale);
  const h = Math.round(p.h * scale);

  const resized = await sharp(p.data).resize(w, h).toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    // フラットな絵なのでパレット化してもほぼ劣化せず、容量が 1/3 になる
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(`${OUT}/${p.name}.png`);

  console.log(`${p.name.padEnd(7)} ${p.w}x${p.h} → ${w}x${h} を ${SIZE}x${SIZE} の中央へ`);
}
