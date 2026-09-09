// ビルド済みの dist/ を gh-pages ブランチへ push する。
//
// GitHub Actions を使っていないのは、gh の認証トークンに workflow スコープが
// 無く、.github/workflows/ を push できないため。こちらは追加の権限が要らない。

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

const run = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit' });
const capture = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!existsSync(DIST)) {
  console.error('dist/ がありません。先に npm run build を実行してください。');
  process.exit(1);
}

const remote = capture(['remote', 'get-url', 'origin']);
const name = capture(['config', 'user.name']);
const email = capture(['config', 'user.email']);

// Pages は _ で始まるパスを Jekyll 扱いで無視するので、それを止める
writeFileSync(join(DIST, '.nojekyll'), '');

// dist を使い捨てのリポジトリにして、履歴を持たない 1 コミットとして押し込む
rmSync(join(DIST, '.git'), { recursive: true, force: true });
run(['init', '-q'], DIST);
run(['config', 'user.name', name], DIST);
run(['config', 'user.email', email], DIST);
run(['checkout', '-q', '-B', 'gh-pages'], DIST);
run(['add', '-A'], DIST);
run(['commit', '-q', '-m', `deploy ${new Date().toISOString()}`], DIST);
run(['push', '-q', '-f', remote, 'gh-pages:gh-pages'], DIST);
rmSync(join(DIST, '.git'), { recursive: true, force: true });

console.log('gh-pages へ反映しました');
