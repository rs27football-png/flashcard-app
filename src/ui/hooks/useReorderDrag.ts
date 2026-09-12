import { useCallback, useEffect, useRef, useState } from 'react'

/** 並べ替えの対象に付ける属性. 値は現在の位置 (0始まり) */
export const ORDER_ATTRIBUTE = 'data-order-index'

/**
 * 一覧をドラッグで並べ替える (specs.md §4.9.2).
 *
 * HTML5 のドラッグ&ドロップは iOS Safari のタッチで発火しないため使わず,
 * Pointer Events で組んでタッチとマウスを同一経路で扱う (specs.md §6.4).
 * 掴む位置はつまみに限定し, 画面の縦スクロールと競合させない.
 *
 * 掴んだ行が別の行の上に来た時点で入れ替える. 落とす位置を別に描かなくて済み,
 * 並びがその場で見えるため, 数件の並べ替えでは分かりやすい.
 */
export function useReorderDrag(onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // 掴んでいる行の現在位置. 入れ替えるたびに動くため, 購読を張り直さずに読めるようにする
  const indexRef = useRef<number | null>(null)
  const onMoveRef = useRef(onMove)

  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const start = useCallback((event: React.PointerEvent, index: number) => {
    // つまみの上でのスクロールや文字選択を止める
    event.preventDefault()
    indexRef.current = index
    setDragIndex(index)
  }, [])

  const isDragging = dragIndex !== null

  useEffect(() => {
    if (!isDragging) return

    const resolveIndex = (x: number, y: number): number | null => {
      const element = document.elementFromPoint(x, y)
      const row = element?.closest(`[${ORDER_ATTRIBUTE}]`)
      if (row === null || row === undefined) return null
      const value = Number(row.getAttribute(ORDER_ATTRIBUTE))
      return Number.isNaN(value) ? null : value
    }

    const onPointerMove = (event: PointerEvent) => {
      const from = indexRef.current
      if (from === null) return
      const to = resolveIndex(event.clientX, event.clientY)
      if (to === null || to === from) return
      indexRef.current = to
      setDragIndex(to)
      onMoveRef.current(from, to)
    }

    const end = () => {
      indexRef.current = null
      setDragIndex(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [isDragging])

  return { dragIndex, start }
}
