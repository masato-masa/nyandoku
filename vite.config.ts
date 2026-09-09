import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパスで配信されるため、ここを合わせる。
  // 変えるとビルド後のアセット参照が全部壊れるので、リポジトリ名と必ず一致させること。
  base: '/nyandoku/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
