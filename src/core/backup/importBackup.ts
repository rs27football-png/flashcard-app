// バックアップの取り込み (specs.md §4.11).
import { unzip } from 'fflate'
import type { Asset, AppSettings, Card, CardProgress, Folder, StudySet } from '../types'
import { db, newId, nextOrder } from '../db/db'
import { DEFAULT_APP_SETTINGS } from '../db/settings'
import { buildCardNormalized } from '../search/normalize'
import {
  ASSET_DIR,
  DATA_ENTRY,
  parseBackupData,
  type BackupContent,
  type ImportSummary,
} from './format'

/** 取り込み方式 (specs.md §4.11) */
export type ImportMode = 'replace' | 'merge'

export interface ImportOptions {
  mode: ImportMode
  /**
   * この端末の学習状況と設定を残すか (specs.md §4.11).
   *
   * 写しの側の端末でも学習するため, 置き換えのたびに記録が消えては運用が続かない.
   * カードの中身だけを入れ替え, 進捗・中断状態・設定はこの端末のものを維持する.
   * マージは ID を採番し直して照合できないため, 置き換えのときだけ効く.
   */
  keepLocalState: boolean
}

function unzipAsync(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(new Error('ZIP を展開できませんでした。'))
      else resolve(data)
    })
  })
}

/** 選ばれたファイルを, data.json と画像の実体に解く */
export async function readBackupFile(file: File): Promise<BackupContent> {
  const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
  if (!isZip) {
    return { data: parseBackupData(await file.text()), files: new Map() }
  }

  const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
  const dataEntry = entries[DATA_ENTRY]
  if (dataEntry === undefined) {
    throw new Error(`ZIP に ${DATA_ENTRY} が入っていません。`)
  }
  const files = new Map<string, Uint8Array>()
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.startsWith(ASSET_DIR)) files.set(name, bytes)
  }
  return { data: parseBackupData(new TextDecoder().decode(dataEntry)), files }
}

/** 取り込む前に中身を知らせるための概要 */
export function summarize(content: BackupContent): {
  folders: number
  sets: number
  cards: number
  assets: number
  exportedAt: number
  withImages: number
} {
  const withImages = content.data.assets.filter(
    (asset) => asset.file !== undefined && content.files.has(asset.file),
  ).length
  return {
    folders: content.data.folders.length,
    sets: content.data.sets.length,
    cards: content.data.cards.length,
    assets: content.data.assets.length,
    exportedAt: content.data.exportedAt,
    withImages,
  }
}

/** すべてのテーブルを一度の取引で書き換える. 途中で失敗しても半端な状態を残さない */
const SCOPE = [db.folders, db.sets, db.cards, db.progress, db.assets, db.sessions, db.settings]

/**
 * バックアップを取り込む (specs.md §4.11).
 *
 * - 置き換え: 既存データをすべて捨てて復元する. ID はそのまま使う
 * - マージ: 既存を残して足す. ID は採番し直し, 階層と参照の対応だけを保つ
 *
 * 画像の実体がないものは「画像なし」として取り込み, 影響を受けたカード数を返す.
 */
export async function importBackup(
  content: BackupContent,
  options: ImportOptions,
): Promise<ImportSummary> {
  const { data, files } = content
  const { mode } = options
  // マージは ID が変わるため照合が成立しない. 置き換えのときだけ効かせる
  const keepLocal = mode === 'replace' && options.keepLocalState
  const now = Date.now()

  // 実体のある画像だけを Blob に起こす. 参照だけが残った画像は捨てる
  const assetBlobs = new Map<string, Blob>()
  for (const asset of data.assets) {
    const bytes = asset.file === undefined ? undefined : files.get(asset.file)
    if (bytes === undefined) continue
    // fflate が返す配列は別の器なので, そのまま Blob に渡してよい
    assetBlobs.set(asset.id, new Blob([bytes as BlobPart], { type: asset.mimeType }))
  }

  return db.transaction('rw', SCOPE, async () => {
    // 消す前に控える. カードの ID で照合するため, 内容の入れ替えとは独立に扱える
    const localProgress = keepLocal
      ? new Map((await db.progress.toArray()).map((record) => [record.cardId, record]))
      : new Map<string, CardProgress>()
    const localSettings = keepLocal ? await db.settings.get('app') : undefined

    if (mode === 'replace') {
      await Promise.all([
        db.folders.clear(),
        db.sets.clear(),
        db.cards.clear(),
        db.progress.clear(),
        db.assets.clear(),
      ])
      // 中断状態のキューは取り込み前の ID を指す. 進捗を残す場合だけ維持し,
      // 指しているカードが現存するかは再開時に検証する (specs.md §2.6)
      if (!keepLocal) await db.sessions.clear()
    }

    /** 置き換えでは元の ID をそのまま, マージでは採番し直す */
    const remap = new Map<string, string>()
    const idOf = (id: string) => {
      if (mode === 'replace') return id
      const mapped = remap.get(id)
      if (mapped !== undefined) return mapped
      const created = newId()
      remap.set(id, created)
      return created
    }

    // --- フォルダ ---
    const folders: Folder[] = data.folders.map((folder) => ({
      ...folder,
      id: idOf(folder.id),
      parentId: folder.parentId === null ? null : idOf(folder.parentId),
    }))
    if (mode === 'merge') {
      // 最上位のフォルダだけ, 既存の並びの後ろへ回す. 既存と order が重ならないようにする
      const existing = await db.folders.toArray()
      let order = nextOrder(existing.filter((folder) => folder.parentId === null))
      for (const folder of folders) {
        if (folder.parentId === null) folder.order = order++
      }
    }

    // --- 学習セット ---
    const sets: StudySet[] = data.sets.map((set) => ({
      ...set,
      id: idOf(set.id),
      folderId: set.folderId === null ? null : idOf(set.folderId),
    }))
    if (mode === 'merge') {
      const existing = await db.sets.toArray()
      let order = nextOrder(existing.filter((set) => set.folderId === null))
      for (const set of sets) {
        if (set.folderId === null) set.order = order++
      }
    }

    // --- 画像 ---
    const assets: Asset[] = []
    for (const asset of data.assets) {
      const blob = assetBlobs.get(asset.id)
      if (blob === undefined) continue
      assets.push({
        id: idOf(asset.id),
        setId: idOf(asset.setId),
        blob,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        createdAt: asset.createdAt,
      })
    }
    const restored = new Set(data.assets.filter((asset) => assetBlobs.has(asset.id)).map((a) => a.id))

    // --- カード ---
    let cardsMissingImages = 0
    const cards: Card[] = data.cards.map((card) => {
      const term = restored.has(card.termImageId ?? '') ? idOf(card.termImageId as string) : null
      const definition = restored.has(card.definitionImageId ?? '')
        ? idOf(card.definitionImageId as string)
        : null
      // 参照はあったのに実体が無かった面を数える. 取り込み後に報告する
      if (
        (card.termImageId !== null && term === null) ||
        (card.definitionImageId !== null && definition === null)
      ) {
        cardsMissingImages += 1
      }
      return {
        ...card,
        id: idOf(card.id),
        setId: idOf(card.setId),
        termImageId: term,
        definitionImageId: definition,
        // 検索用の文字列は保存側に持たせていないため, ここで作り直す
        normalized: buildCardNormalized(card),
      }
    })

    // --- 進捗 ---
    // まずファイルの内容を敷き, その上からこの端末の記録を被せる.
    // この順にすると, 手元に何もない端末への復元ではファイルの進捗がそのまま残る
    let progressKept = 0
    const progress: CardProgress[] = data.progress.map((record) => {
      const cardId = idOf(record.cardId)
      const local = localProgress.get(cardId)
      if (local === undefined) return { ...record, cardId, setId: idOf(record.setId) }
      progressKept += 1
      return { ...local, cardId, setId: idOf(record.setId) }
    })

    await db.folders.bulkPut(folders)
    await db.sets.bulkPut(sets)
    await db.assets.bulkPut(assets)
    await db.cards.bulkPut(cards)
    await db.progress.bulkPut(progress)
    // 設定を戻すのは, この端末の状態を残さない置き換えのときだけ.
    // 同期のたびに別の端末のテーマや既定値が持ち込まれるのを避ける
    const base: AppSettings | undefined =
      keepLocal || mode === 'merge' ? localSettings : data.settings
    await db.settings.put({
      ...DEFAULT_APP_SETTINGS,
      ...base,
      id: 'app',
      // 取り込んだ時点で, この端末のデータは外部のファイルと一致している (specs.md §2.8)
      lastImportAt: now,
    })

    return {
      folders: folders.length,
      sets: sets.length,
      cards: cards.length,
      assets: assets.length,
      cardsMissingImages,
      progressKept,
    }
  })
}
