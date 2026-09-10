import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * ダイアログの土台.
 *
 * 自前のオーバーレイではなく <dialog> を用いる. 最前面への配置, 背面の操作の抑止,
 * Esc での閉止をブラウザ側が受け持つため, 実装量とキーボード操作の抜けが減る.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      // Esc は既定のまま閉じさせると React 側の状態が open のまま取り残されるため,
      // いったん抑止して onClose を通す.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="modal__head">
        <h2 className="modal__title">{title}</h2>
        <button type="button" className="btn btn--icon" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal__body">{children}</div>
    </dialog>
  )
}
