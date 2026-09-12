// バックアップの形式 (specs.md §4.11).
//
// 画像を Base64 として JSON に埋め込む方式は採らない. 量が約1.37倍に膨らむうえ,
// 数十 MB の単一 JSON を解析する際に端末が止まるおそれがあるためである.
// 画像を含める場合は ZIP に data.json と assets/<id>.<拡張子> を並べる.
import type { AppSettings, Card, CardProgress, Folder, StudySet } from '../types'

/** この形式の版. 将来 data.json の構造を変えたときに読み分ける */
export const BACKUP_SCHEMA = 1

/** 取り違えを防ぐための目印 */
export const BACKUP_APP = 'flashcard-app'

export const DATA_ENTRY = 'data.json'
export const ASSET_DIR = 'assets/'

/** 画像の実体は別ファイルに置くため, メタ情報だけを持つ */
export interface BackupAsset {
  id: string
  setId: string
  mimeType: 'image/webp' | 'image/jpeg'
  width: number
  height: number
  bytes: number
  createdAt: number
  /** ZIP 内の位置. 画像を含めない書き出しでは undefined */
  file?: string
}

/** normalized は派生値のため持たない. 取り込み時に作り直す (specs.md §2.3) */
export type BackupCard = Omit<Card, 'normalized'>

export interface BackupData {
  app: typeof BACKUP_APP
  schema: number
  exportedAt: number
  /** 画像の実体を伴うか */
  includesImages: boolean
  folders: Folder[]
  sets: StudySet[]
  cards: BackupCard[]
  progress: CardProgress[]
  assets: BackupAsset[]
  settings: AppSettings
}

/** 画像の種別から ZIP 内の拡張子を決める */
export function extensionOf(mimeType: BackupAsset['mimeType']): string {
  return mimeType === 'image/webp' ? 'webp' : 'jpg'
}

/** flashcards_YYYYMMDD_HHmm.zip の形にする (specs.md §4.11) */
export function backupFileName(at: number, extension: 'zip' | 'json'): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  return `flashcards_${stamp}.${extension}`
}

/**
 * 読み込んだ JSON がこのアプリのバックアップか確かめる.
 *
 * 別のファイルを取り込んで既存データを壊すことがないよう, 置き換えの前に必ず通す.
 */
export function parseBackupData(text: string): BackupData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('ファイルの中身を読み取れませんでした。')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('このファイルはバックアップではありません。')
  }
  const data = parsed as Partial<BackupData>
  if (data.app !== BACKUP_APP) {
    throw new Error('このファイルはこのアプリのバックアップではありません。')
  }
  if (typeof data.schema !== 'number' || data.schema > BACKUP_SCHEMA) {
    throw new Error('新しい版のバックアップです。アプリを更新してから取り込んでください。')
  }
  if (
    !Array.isArray(data.folders) ||
    !Array.isArray(data.sets) ||
    !Array.isArray(data.cards) ||
    !Array.isArray(data.progress) ||
    !Array.isArray(data.assets)
  ) {
    throw new Error('バックアップの中身が壊れています。')
  }
  return data as BackupData
}

/** 取り込みの結果. 画面で内訳を示すために数える */
export interface ImportSummary {
  folders: number
  sets: number
  cards: number
  assets: number
  /** 実体が見つからず「画像なし」として取り込んだカード数 (specs.md §4.11) */
  cardsMissingImages: number
}

export interface BackupContent {
  data: BackupData
  /** ZIP から取り出した画像の実体. 画像を含まない JSON では空 */
  files: Map<string, Uint8Array>
}
