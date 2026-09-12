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
  /** 指 ( またはマウス ) の位置。掴んでいるものを追従させるために使う */
  x: number
  y: number
}

const IDLE: ReorderState = { dragIndex: null, insertIndex: null, x: 0, y: 0 }

/**
 * 一覧をドラッグで並べ替える (specs.md §4.3, §4.9.2)。
 *
 * HTML5 のドラッグ&ドロップは iOS Safari のタッチで発火しないため使わず、
 * Pointer Events で組んでタッチとマウスを同一経路で扱う (specs.md §6.4)。
 * 掴む位置はつまみに限定し、画面の縦スクロールと競合させない。
 *
 * 掴んでいるあいだ一覧の並びは変えず、挿入先を線で示す。掴んだものは指に追従させて
 * 別に描くため、元の並びと見比べながら落とす位置を決められる。
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
      update({ dragIndex: index, insertIndex: index, x: event.clientX, y: event.clientY })
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
      // 一覧の外へ出ても掴んだものは付いてくる。挿入先は最後に指した位置を保つ
      const insertIndex = resolveInsertIndex(event.clientX, event.clientY) ?? current.insertIndex
      update({ ...current, insertIndex, x: event.clientX, y: event.clientY })
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

  return {
    dragIndex: state.dragIndex,
    insertIndex: state.insertIndex,
    /** 掴んでいるものを描く位置 */
    point: { x: state.x, y: state.y },
    start,
  }
}
