import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages のプロジェクトサイトは https://<ユーザ名>.github.io/<リポジトリ名>/ で
// 公開される. base をリポジトリ名に合わせないと, 公開後に JS と CSS の参照が
// すべてルート直下を指してしまい404になる.
export default defineConfig({
  base: '/flashcard-app/',
  plugins: [
    react(),
    // 機内モードでも学習できるようにする (specs.md §6.1).
    // Service Worker はビルド成果物から自動生成する.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '単語帳アプリ',
        short_name: '単語帳',
        description: '応用情報技術者試験と大学の試験対策のための単語帳',
        lang: 'ja',
        start_url: '/flashcard-app/',
        scope: '/flashcard-app/',
        // ホーム画面から開いたときにブラウザの枠を出さない
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14161a',
        theme_color: '#14161a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // maskable は端末側の形に切り抜かれる. 図柄は中央8割に収めてある
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 数式の字形も先に取り込む. 取りこぼすとオフラインで数式が崩れる.
        // ただし woff2 だけにする. 同じ字形の woff と ttf まで抱えると
        // 初回の取得が 1 MB 近く重くなり, 現行のブラウザはどれも woff2 を選ぶ
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 画像と学習データは IndexedDB にあるため, ここで持つのは殻だけでよい
        navigateFallback: '/flashcard-app/index.html',
      },
      devOptions: {
        // 開発中は Service Worker を挟まない. 変更が反映されず混乱するため
        enabled: false,
      },
    }),
  ],
})
