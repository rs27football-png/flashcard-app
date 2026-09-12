import { useCallback, useEffect, useRef, useState } from 'react'

/** 並べ替えの対象に付ける属性。値は現在の位置 (0始まり) */
export const ORDER_ATTRIBUTE = 'data-order-index'

interface ReorderState {
  /** 掴んでいる行の位置。掴んでいなければ null */
  dragIndex: number | null
  /**
   * 挿入先。この位置の直前に入る。
   * 要素数と同じ値のときは末尾に入ることを表す。
   */
  insertIndex: number | null
}

const IDLE: ReorderState = { dragIndex: null, insertIndex: null }

/**
 * 一覧をドラッグで並べ替える (specs.md §4.9.2)。
 *
 * HTML5 のドラッグ&ドロップは iOS Safari のタッチで発火しないため使わず、
 * Pointer Events で組んでタッチとマウスを同一経路で扱う (specs.md §6.4)。
 * 掴む位置はつまみに限定し、画面の縦スクロールと競合させない。
 *
 * 動かしている最中は並びを変えず、挿入先だけを示す。落とすまで元の並びが残るため、
 * どこへ入るのかを元の並びと見比べて確かめられる。
 */
export function useReorderDrag(onMove: (from: number, to: number) => void) {
  const [state, setState] = useState<ReorderState>(IDLE)
  // 掴んでいる位置と挿入先。購読を張り直さずに読めるよう、状態とは別に持つ
  const stateRef = useRef<ReorderState>(IDLE)
  const onMoveRef = useRef(onMove)

  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const update = useCallback((next: ReorderState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const start = useCallback(
    (event: React.PointerEvent, index: number) => {
      // つまみの上でのスクロールや文字選択を止める
      event.preventDefault()
      update({ dragIndex: index, insertIndex: index })
    },
    [update],
  )

  const isDragging = state.dragIndex !== null

  useEffect(() => {
    if (!isDragging) return

    const resolveInsertIndex = (x: number, y: number): number | null => {
      const element = document.elementFromPoint(x, y)
      const row = element?.closest(`[${ORDER_ATTRIBUTE}]`)
      if (row === null || row === undefined) return null
      const index = Number(row.getAttribute(ORDER_ATTRIBUTE))
      if (Number.isNaN(index)) return null
      // 行の上半分ならその行の手前、下半分なら次の位置に入れる
      const rect = row.getBoundingClientRect()
      return y < rect.top + rect.height / 2 ? index : index + 1
    }

    const onPointerMove = (event: PointerEvent) => {
      const current = stateRef.current
      if (current.dragIndex === null) return
      const insertIndex = resolveInsertIndex(event.clientX, event.clientY)
      if (insertIndex === null || insertIndex === current.insertIndex) return
      update({ ...current, insertIndex })
    }

    const finish = () => {
      const { dragIndex, insertIndex } = stateRef.current
      update(IDLE)
      if (dragIndex === null || insertIndex === null) return
      // 自分より後ろへ入れる場合、自分が抜けた分だけ行き先が1つ前へずれる
      const to = insertIndex > dragIndex ? insertIndex - 1 : insertIndex
      if (to !== dragIndex) onMoveRef.current(dragIndex, to)
    }

    const cancel = () => update(IDLE)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [isDragging, update])

  return { dragIndex: state.dragIndex, insertIndex: state.insertIndex, start }
}
