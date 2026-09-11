import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /**
   * 表示の形. sheet は狭い画面で下からせり上がる一覧として出す.
   * 親指の届く位置に選択肢を置くためで, 広い画面では中央のダイアログと同じ見え方になる.
   */
  variant?: 'center' | 'sheet'
}

/**
 * ダイアログの土台.
 *
 * 自前のオーバーレイではなく <dialog> を用いる. 最前面への配置, 背面の操作の抑止,
 * Esc での閉止をブラウザ側が受け持つため, 実装量とキーボード操作の抜けが減る.
 */
export function Modal({ open, title, onClose, children, variant = 'center' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    // 開いたまま取り外された場合に, 最前面の層へ取り残さない
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={variant === 'sheet' ? 'modal modal--sheet' : 'modal'}
      // シートは背景を押して閉じられるようにする. 選ぶだけの一覧で, 入力を失う心配がないため.
      // 入力欄を持つ中央のダイアログでは, 誤って閉じないようこの動作を付けない.
      onClick={(event) => {
        if (variant === 'sheet' && event.target === event.currentTarget) onClose()
      }}
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
