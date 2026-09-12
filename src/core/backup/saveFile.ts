// 書き出したファイルを端末に渡す (specs.md §4.11).

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * ファイルを保存させる.
 *
 * iOS の Safari には「ダウンロード先を選ぶ」という考えがないため, 共有シートに載せて
 * ファイルアプリや OneDrive へ送れるようにする. 共有に対応しない環境では
 * 通常のダウンロードにする.
 */
export async function saveFile(name: string, blob: Blob): Promise<SaveResult> {
  const file = new File([blob], name, { type: blob.type })
  if (navigator.canShare?.({ files: [file] }) === true) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (cause) {
      // 利用者が共有シートを閉じただけの場合は, ダウンロードに読み替えない
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'cancelled'
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // 取得が始まる前に解放すると保存に失敗する. 少し待ってから片付ける
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
