import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const MIN_SCALE = 1
const MAX_SCALE = 6

interface ImageViewerProps {
  src: string
  alt: string
  onClose: () => void
}

/**
 * 画像の全画面表示 (specs.md §4.4.2)。
 *
 * 図表を貼ると学習中の縮小表示では字が読めないため, 拡大して確かめられるようにする。
 * ピンチと車輪で拡大縮小し, 拡大中は指で位置を動かせる。
 * 実装は Pointer Events で統一する。タッチとマウスを同じ経路で扱うためである (specs.md §6.4)。
 */
export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  // 触れている指。2本あればピンチ, 1本なら移動
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const distanceOf = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) pinch.current = { distance: distanceOf(), scale }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (previous === undefined) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size >= 2 && pinch.current !== null) {
      const ratio = distanceOf() / pinch.current.distance
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinch.current.scale * ratio))
      setScale(next)
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 })
      return
    }
    // 等倍のときは動かさない。画面いっぱいに収まっており, 動かす先がないため
    if (scale === MIN_SCALE) return
    setOffset((current) => ({
      x: current.x + (event.clientX - previous.x),
      y: current.y + (event.clientY - previous.y),
    }))
  }

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onWheel = (event: React.WheelEvent) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - event.deltaY / 500))
    setScale(next)
    if (next === MIN_SCALE) setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      // 背景を触れば閉じる。拡大中は動かす操作と紛らわしいため等倍のときだけ
      onClick={() => {
        if (scale === MIN_SCALE) onClose()
      }}
      onDoubleClick={reset}
    >
      <div className="image-viewer__bar">
        <span className="image-viewer__scale">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="btn btn--tool"
          aria-label="閉じる"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <img
        className="image-viewer__image"
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      />
      <p className="image-viewer__hint">ピンチまたは車輪で拡大, 2回叩くと元に戻ります</p>
    </div>
  )
}
