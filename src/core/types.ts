// データモデルの型定義 ( specs.md §2 ).
// 各所で再定義せず, 必ずこのファイルから import する.
//
// 日付はすべて UNIX ミリ秒の number で保持する.
// Date オブジェクトは IndexedDB のインデックスで扱いが煩雑になるため格納しない.

/** フォルダ ( specs.md §2.1 ) */
export interface Folder {
  id: string
  /** 1〜100文字. 同一階層内での重複を許容する */
  name: string
  /** null はルート直下を意味する */
  parentId: string | null
  /** 同一階層内の表示順 */
  order: number
  createdAt: number
  updatedAt: number
}

/** 学習セット ( specs.md §2.2 ) */
export interface StudySet {
  id: string
  /** 1〜100文字 */
  name: string
  /** 0〜500文字, 任意 */
  description: string
  /** null はルート直下 */
  folderId: string | null
  order: number
  /** リッチコンテンツ: 画像を使う. 新規セットでは false ( §4.4.1 ) */
  enableImages: boolean
  /** リッチコンテンツ: 数式を使う. 新規セットでは false ( §4.4.1 ) */
  enableMath: boolean
  /** 当該セットで最後に使用した学習オプション ( specs.md §2.2, §2.7 ) */
  studyOptions: StudyOptions
  createdAt: number
  updatedAt: number
}

/** カード ( specs.md §2.3 ) */
export interface Card {
  id: string
  setId: string
  /** 用語 ( 表 ). 1〜1000文字. 画像がある場合に限り空文字列を許容する */
  term: string
  /** 定義 ( 裏 ). 1〜2000文字. 画像がある場合に限り空文字列を許容する */
  definition: string
  /** ヒント. 0〜200文字, 任意 */
  hint: string
  /** 表面の画像 ( 段階6 で使用 ) */
  termImageId: string | null
  /** 裏面の画像 ( 段階6 で使用 ) */
  definitionImageId: string | null
  starred: boolean
  /** セット内の表示順 */
  order: number
  /**
   * 検索用の正規化済み文字列 ( specs.md §2.3, v3.1 で追加 ).
   * 検索のたびに正規化を行うと10,000枚で応答が間に合わないため, 保存時に生成して保持する.
   */
  normalized: string
  createdAt: number
  updatedAt: number
}

/** 画像 ( specs.md §2.4 ). 段階6 で使用する */
export interface Asset {
  id: string
  /** 削除の連動と容量集計に用いる */
  setId: string
  /** 圧縮済みの画像本体. Base64 ではなく Blob で保持する */
  blob: Blob
  mimeType: 'image/webp' | 'image/jpeg'
  width: number
  height: number
  bytes: number
  createdAt: number
}

/** 進捗状態の3値 ( specs.md §1 ) */
export type ProgressStatus = 'unseen' | 'learning' | 'known'

/** カード進捗 ( specs.md §2.5 ) */
export interface CardProgress {
  /** 主キー */
  cardId: string
  /** 索引用に冗長保持する */
  setId: string
  status: ProgressStatus
  lastAnsweredAt: number | null
  quizCorrect: number
  quizWrong: number
}

/** 学習オプション ( specs.md §2.7 ) */
export interface StudyOptions {
  trackProgress: boolean
  starredOnly: boolean
  front: 'term' | 'definition'
  shuffle: boolean
}

/** 中断状態の保存 ( specs.md §2.6 ). 段階3 で使用する */
export interface StudySession {
  /** 主キー. セットごとに1件だけ保持する */
  setId: string
  mode: 'flashcard' | 'quiz'
  options: StudyOptions
  /** 出題順のカードID配列 */
  queue: string[]
  currentIndex: number
  roundNumber: number
  updatedAt: number
}

/** アプリ設定 ( specs.md §2.8 ). 単一レコードとして保存する */
export interface AppSettings {
  /** 単一レコードを指す固定の主キー */
  id: 'app'
  theme: 'dark' | 'light' | 'system'
  showShortcutHints: boolean
  quizAffectsProgress: boolean
  /** 画像リサイズの長辺上限 */
  imageMaxEdge: number
  lastBackupAt: number | null
}

/** セット詳細画面に表示する進捗サマリ ( specs.md §4.2 ) */
export interface ProgressSummary {
  total: number
  known: number
  learning: number
  unseen: number
}
