import { useCallback, useEffect, useState } from 'react'

// 開閉状態は失われても実害がなく容量も小さいため localStorage に置く.
// 学習データ (カード, 進捗, 画像) は容量と Blob の都合で IndexedDB を用いる.
const STORAGE_KEY = 'flashcard-app:expanded-folders'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    // プライベートブラウズなどで読み書きが例外になる環境がある. 既定値で続行する.
    return new Set()
  }
}

/** フォルダツリーの開閉状態を保持する (specs.md §4.1) */
export function useExpandedFolders() {
  const [expanded, setExpanded] = useState<Set<string>>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]))
    } catch {
      // 保存できなくても操作は続けられるため握りつぶす
    }
  }, [expanded])

  const toggle = useCallback((folderId: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  const expand = useCallback((folderId: string) => {
    setExpanded((previous) => new Set(previous).add(folderId))
  }, [])

  return { expanded, toggle, expand }
}
