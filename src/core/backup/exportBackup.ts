// バックアップの書き出し (specs.md §4.11).
import { zip } from 'fflate'
import { db } from '../db/db'
import { getAppSettings } from '../db/settings'
import {
  ASSET_DIR,
  BACKUP_APP,
  BACKUP_SCHEMA,
  DATA_ENTRY,
  backupFileName,
  extensionOf,
  type BackupAsset,
  type BackupCard,
  type BackupData,
} from './format'

export interface BackupFile {
  name: string
  blob: Blob
  /** 何を書き出したかを画面に示すために返す */
  counts: { sets: number; cards: number; assets: number }
}

/** fflate の zip は callback 形式のため, 約束の形に直して待てるようにする */
function zipAsync(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // level 6 は速さと縮みの釣り合いが良い. 画像は既に圧縮済みなので無圧縮で通す
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

/**
 * 全データを書き出す.
 *
 * @param includeImages 画像の実体を含めるか. 含める場合は ZIP, 含めない場合は JSON になる
 */
export async function exportBackup(includeImages: boolean): Promise<BackupFile> {
  const [folders, sets, cards, progress, assets, settings] = await Promise.all([
    db.folders.toArray(),
    db.sets.toArray(),
    db.cards.toArray(),
    db.progress.toArray(),
    db.assets.toArray(),
    getAppSettings(),
  ])

  const backupAssets: BackupAsset[] = assets.map((asset) => ({
    id: asset.id,
    setId: asset.setId,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    createdAt: asset.createdAt,
    file: includeImages ? `${ASSET_DIR}${asset.id}.${extensionOf(asset.mimeType)}` : undefined,
  }))

  // normalized は派生値なので持たせない. 取り込み側で作り直す
  const backupCards: BackupCard[] = cards.map(({ normalized: _normalized, ...card }) => card)

  const exportedAt = Date.now()
  const data: BackupData = {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt,
    includesImages: includeImages,
    folders,
    sets,
    cards: backupCards,
    progress,
    assets: backupAssets,
    settings,
  }
  const json = JSON.stringify(data)
  const counts = { sets: sets.length, cards: cards.length, assets: includeImages ? assets.length : 0 }

  if (!includeImages) {
    return {
      name: backupFileName(exportedAt, 'json'),
      blob: new Blob([json], { type: 'application/json' }),
      counts,
    }
  }

  const entries: Record<string, Uint8Array> = {
    [DATA_ENTRY]: new TextEncoder().encode(json),
  }
  for (const asset of assets) {
    entries[`${ASSET_DIR}${asset.id}.${extensionOf(asset.mimeType)}`] = new Uint8Array(
      await asset.blob.arrayBuffer(),
    )
  }
  const packed = await zipAsync(entries)
  return {
    name: backupFileName(exportedAt, 'zip'),
    // fflate が返すのは同じ内容の別の器であるため, そのまま Blob に渡してよい
    blob: new Blob([packed as BlobPart], { type: 'application/zip' }),
    counts,
  }
}
