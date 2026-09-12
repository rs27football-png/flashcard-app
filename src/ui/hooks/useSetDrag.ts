import { useCallback, useEffect, useRef, useState } from 'react'

/** 落下先を表す属性名. フォルダの節には ID を, 根の領域には 'root' を入れる */
export const DROP_ATTRIBUTE = 'data-drop-folder'
export const ROOT_DROP_VALUE = 'root'

interface DragState {
  setId: string
  label: string
  /** 画面座標. 追随する影の位置に使う */
  x: number
  y: number
  /** 落下先のフォルダ. null は根. 有効な落下先の上にいない場合は undefined */
  overFolderId: string | null | undefined
}

/**
 * 学習セットをドラッグしてフォルダへ落とす (specs.md §4.1).
 *
 * HTML5 のドラッグ&ドロップは iOS Safari のタッチで発火しないため使わない.
 * Pointer Events で組み, タッチとマウスを同一経路で扱う (specs.md §6.4).
 *
 * 掴む位置は専用のつまみに限定してある. 行そのものを掴めるようにすると,
 * 一覧を指で縦にスクロールする操作とドラッグの開始が区別できなくなるため.
 */
export function useSetDrag(onDrop: (setId: string, folderId: string | null) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  // 移動のたびに購読し直さずに済むよう, 最新の状態を別に持つ
  const dragRef = useRef<DragState | null>(null)
  const onDropRef = useRef(onDrop)
  // 描画中に ref を書き換えないよう, 反映は確定後に行う
  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const start = useCallback(
    (event: React.PointerEvent, setId: string, label: string) => {
      // つまみの上でのスクロールや文字選択を止める
      event.preventDefault()
      update({ setId, label, x: event.clientX, y: event.clientY, overFolderId: undefined })
    },
    [update],
  )

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return

    const resolveTarget = (x: number, y: number): string | null | undefined => {
      // 掴んでいる影は pointer-events: none にしてあるので, 下の要素が取れる
      const element = document.elementFromPoint(x, y)
      const zone = element?.closest(`[${DROP_ATTRIBUTE}]`)
      if (zone === null || zone === undefined) return undefined
      const value = zone.getAttribute(DROP_ATTRIBUTE)
      return value === ROOT_DROP_VALUE ? null : value
    }

    const onMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (current === null) return
      update({
        ...current,
        x: event.clientX,
        y: event.clientY,
        overFolderId: resolveTarget(event.clientX, event.clientY),
      })
    }

    const onUp = (event: PointerEvent) => {
      const current = dragRef.current
      update(null)
      if (current === null) return
      const target = resolveTarget(event.clientX, event.clientY)
      if (target !== undefined) onDropRef.current(current.setId, target)
    }

    const onCancel = () => update(null)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [isDragging, update])

  return { drag, start }
}
