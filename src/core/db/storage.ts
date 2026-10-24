// 保存領域の永続化 (specs.md §6.2 P2).
//
// ブラウザは空き容量が逼迫すると, 断りなくサイトの保存領域を破棄することがある.
// 永続化を認められた領域はその対象から外れるため, 起動時に一度だけ要求する.

/**
 * 保存領域の永続化を要求する.
 *
 * 許可するかどうかは端末側の判断であり, 要求しても拒まれることがある.
 * 失敗しても通常の動作には影響しないため, 呼び出し側では結果を気にしなくてよい.
 *
 * @returns 永続化されているかどうか. 判定できない環境では null
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) return null
  try {
    // 既に認められている場合に persist() を呼び直しても害はないが,
    // 環境によっては利用者に問い合わせが出るため, 先に現状を確かめる
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/** 現在の永続化の状態. 設定画面に示す */
export async function isStoragePersisted(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || navigator.storage?.persisted === undefined) return null
  try {
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}
