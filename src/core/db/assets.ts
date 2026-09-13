// 画像の読み出しと集計 (specs.md §2.4, §4.4).
//
// 書き込み (添付・差し替え・削除) はカードの保存に紐づくため cards.ts が行う.
// ここは表示と集計のための読み出しに徹する.
import type { Asset } from '../types'
import { containsMath } from '../math/segments'
import { db } from './db'

/**
 * セットに属する画像をすべて返す.
 *
 * 一覧の各行が個別に画像を読むと, カード枚数だけ問い合わせが並ぶ.
 * 画面ごとに1回だけまとめて読み, ID から引ける形にして配る.
 */
export function listAssets(setId: string): Promise<Asset[]> {
  return db.assets.where('setId').equals(setId).toArray()
}

export function getAsset(id: string): Promise<Asset | undefined> {
  return db.assets.get(id)
}

/** リッチコンテンツの利用状況. 無効化の確認ダイアログに出す (specs.md §4.4.1) */
export interface RichContentUsage {
  /** 添付されている画像の枚数 */
  images: number
  /** 画像の合計バイト数 */
  bytes: number
  /** 数式を含むカードの枚数 */
  mathCards: number
}

export async function getRichContentUsage(setId: string): Promise<RichContentUsage> {
  const [assets, cards] = await Promise.all([
    listAssets(setId),
    db.cards.where('setId').equals(setId).toArray(),
  ])
  const mathCards = cards.filter(
    (card) => containsMath(card.term) || containsMath(card.definition) || containsMath(card.hint),
  ).length
  return {
    images: assets.length,
    bytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    mathCards,
  }
}

/** 使用容量の内訳 (specs.md §4.12) */
export interface StorageUsage {
  /** 画像の合計バイト数. 端末が総量を答えない場合はこれだけを示す */
  assetBytes: number
  assetCount: number
  /** navigator.storage.estimate() の値. 非対応環境では null */
  usage: number | null
  quota: number | null
  /** セットごとの内訳. 容量を食っているセットを見つけられるようにする */
  perSet: { setId: string; name: string; bytes: number; count: number }[]
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const [assets, sets] = await Promise.all([db.assets.toArray(), db.sets.toArray()])
  const nameById = new Map(sets.map((set) => [set.id, set.name]))

  const totals = new Map<string, { bytes: number; count: number }>()
  for (const asset of assets) {
    const current = totals.get(asset.setId) ?? { bytes: 0, count: 0 }
    totals.set(asset.setId, { bytes: current.bytes + asset.bytes, count: current.count + 1 })
  }

  let usage: number | null = null
  let quota: number | null = null
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate !== undefined) {
    const estimate = await navigator.storage.estimate()
    usage = estimate.usage ?? null
    quota = estimate.quota ?? null
  }

  return {
    assetBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    assetCount: assets.length,
    usage,
    quota,
    perSet: [...totals.entries()]
      .map(([setId, value]) => ({
        setId,
        name: nameById.get(setId) ?? '(削除されたセット)',
        ...value,
      }))
      .sort((a, b) => b.bytes - a.bytes),
  }
}
