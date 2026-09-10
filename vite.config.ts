import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages のプロジェクトサイトは https://<ユーザ名>.github.io/<リポジトリ名>/ で
// 公開される. base をリポジトリ名に合わせないと, 公開後に JS と CSS の参照が
// すべてルート直下を指してしまい404になる.
export default defineConfig({
  base: '/flashcard-app/',
  plugins: [react()],
})
