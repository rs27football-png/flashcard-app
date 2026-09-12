import { useEffect, useRef, useState } from 'react'
import type { Asset } from '../../core/types'

/**
 * 画像を表示するための一時 URL を作る (specs.md §2.4)。
 *
 * createObjectURL で作った URL は明示的に解放しないと, ページを開いているあいだ
 * Blob が居座る。一覧から消えた画像と, 画面を離れるときの解放を漏らさない。
 *
 * 画像の実体は作り直さない限り変わらないため, ID が同じなら URL を使い回す。
 * useLiveQuery は更新のたびに新しい配列を返すので, ここで抑えないと
 * カードを1枚保存するだけで一覧中の全画像が作り直されてちらつく。
 *
 * URL の生成は副作用であるため, 描画中ではなく効果の中で行う。
 */
export function useAssetUrls(assets: readonly Asset[]): Map<string, string> {
  const cache = useRef(new Map<string, string>())
  const [urls, setUrls] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    const alive = new Set(assets.map((asset) => asset.id))
    for (const [id, url] of cache.current) {
      if (!alive.has(id)) {
        URL.revokeObjectURL(url)
        cache.current.delete(id)
      }
    }
    for (const asset of assets) {
      if (!cache.current.has(asset.id)) {
        cache.current.set(asset.id, URL.createObjectURL(asset.blob))
      }
    }
    // 一時 URL の登録簿という外部の仕組みと同期させる用途であり,
    // 描画中に導ける値ではない
    // oxlint-disable-next-line react/set-state-in-effect
    setUrls(new Map(cache.current))
  }, [assets])

  useEffect(() => {
    const cached = cache.current
    return () => {
      for (const url of cached.values()) URL.revokeObjectURL(url)
      // 解放済みの URL を控えに残さない. 開発時の二重実行で再生成させるため
      cached.clear()
    }
  }, [])

  return urls
}

/** 1つの Blob に対する一時 URL。編集中の未保存の画像を映すために使う */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (blob === null) return
    const next = URL.createObjectURL(blob)
    // 同上. URL は効果の中で作られるため, 描画中には決められない
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  // 画像が外れた直後は前回の URL が状態に残っている. 描画の側で打ち消す
  return blob === null ? null : url
}
