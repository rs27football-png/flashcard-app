// 画像の取り込み時圧縮 (specs.md §4.4.2).
//
// 無加工の写真は1枚3〜5 MB に達し, 数十枚で端末の保存領域を圧迫する.
// そのため取り込みの時点で必ず縮小と再符号化を行い, 無圧縮のまま IndexedDB に入れない.

/** 圧縮の結果. そのまま Asset に流し込める形にしてある */
export interface CompressedImage {
  blob: Blob
  mimeType: 'image/webp' | 'image/jpeg'
  width: number
  height: number
  bytes: number
  /** 圧縮前のバイト数. 編集画面に前後を並べて出すために持ち回る (specs.md §4.4.2) */
  originalBytes: number
}

/** 長辺の既定の上限. 設定で変えられる (specs.md §2.8) */
export const DEFAULT_MAX_EDGE = 1600

/** この大きさに収まるまで品質を下げる */
const TARGET_BYTES = 500 * 1024
const WEBP_QUALITY = 0.82
const JPEG_QUALITY = 0.85
/** 品質の下限. これ以上下げると文字が読めなくなる */
const MIN_QUALITY = 0.5

/** 取り込みを試みる形式 (specs.md §4.4.2). HEIC はブラウザがデコードできる場合のみ通る */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif'

export function isImageFile(file: File | null | undefined): file is File {
  return file !== null && file !== undefined && file.type.startsWith('image/')
}

/** バイト数を人が読める形にする. 圧縮の前後を並べて示すために使う */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Decoded {
  width: number
  height: number
  /** canvas へ描き込めるもの. 使い終わったら release を呼ぶ */
  source: CanvasImageSource
  release: () => void
}

/**
 * 画像を復号する.
 *
 * createImageBitmap が使えるならそれを用いる. GIF は先頭の1コマだけが得られ,
 * 静止画として扱う仕様に合う. 対応しない環境では <img> で読み込む.
 */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        release: () => bitmap.close(),
      }
    } catch {
      // HEIC など復号できない形式のことがある. <img> でもう一度試す
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('この画像は読み込めませんでした。'))
      element.src = url
    })
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      // 復号が終わるまで URL を保つ必要があるため, 解放は呼び出し側の後始末に任せる
      release: () => URL.revokeObjectURL(url),
    }
  } catch (cause) {
    URL.revokeObjectURL(url)
    throw cause
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * 画像を圧縮する (specs.md §4.4.2).
 *
 * 1. 長辺が maxEdge を超える場合は縦横比を保って縮小する
 * 2. WebP (品質0.82) で再符号化する. 対応しない環境では JPEG (品質0.85)
 * 3. 500 KB を超える場合は品質を0.1刻みで下げて再試行する (下限0.5)
 */
export async function compressImage(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE,
): Promise<CompressedImage> {
  const decoded = await decode(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('画像を処理できませんでした。')
    // 透過画像を JPEG にすると黒く抜けるため, 先に白で塗ってから描く
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)

    // WebP を書き出せない環境では, 指定を無視して PNG が返る. 種別を見て判別する
    const probe = await toBlob(canvas, 'image/webp', WEBP_QUALITY)
    const webpSupported = probe !== null && probe.type === 'image/webp'
    const mimeType: 'image/webp' | 'image/jpeg' = webpSupported ? 'image/webp' : 'image/jpeg'

    let quality = webpSupported ? WEBP_QUALITY : JPEG_QUALITY
    let blob = webpSupported ? probe : await toBlob(canvas, mimeType, quality)
    while (blob !== null && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality = Math.round((quality - 0.1) * 100) / 100
      const next = await toBlob(canvas, mimeType, quality)
      if (next === null) break
      blob = next
    }
    if (blob === null) throw new Error('画像を変換できませんでした。')

    return {
      blob,
      mimeType,
      width,
      height,
      bytes: blob.size,
      originalBytes: file.size,
    }
  } finally {
    decoded.release()
  }
}
