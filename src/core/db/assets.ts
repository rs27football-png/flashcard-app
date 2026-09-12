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
