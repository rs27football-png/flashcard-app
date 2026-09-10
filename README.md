# 単語帳アプリ

応用情報技術者試験および大学講義の試験対策に用いる, 個人用の単語帳アプリ ( PWA ).

- 仕様: [specs.md](./specs.md)
- 開発規約: [CLAUDE.md](./CLAUDE.md)
- 環境構築と GitHub の手順: [GITHUB_SETUP.md](./GITHUB_SETUP.md)

## 状態

段階2 ( テキストインポート ) まで完了. 次は段階3 ( 暗記モードと進捗管理 ).

公開先: https://rs27football-png.github.io/flashcard-app/

## 開発

```bash
npm install   # 依存をインストールする ( 初回のみ )
npm run dev   # 開発サーバを起動する
npm run build # 本番ビルドを dist/ に出力する
```

## 主な機能 ( 予定 )

- 学習セットのフォルダ管理 ( 階層は任意, 移動可 )
- カード作成 ( 手動入力 / テキストインポート )
- 暗記モード ( 左右への振り分け, 進捗の永続保存 )
- 4択練習問題
- ★マーキング, セットのコピー・統合・分割
- 全セット横断検索
- 画像・数式の添付 ( 学習セットごとに有効化 )
- オフライン動作, JSON / ZIP によるバックアップ

## 技術構成

TypeScript + React + Vite / Dexie.js ( IndexedDB ) / GitHub Pages
