import { useNavigate } from 'react-router-dom'
import type { StudySet } from '../../core/types'
import { Icon } from './Icon'
import { Modal } from './Modal'

interface SetActionsSheetProps {
  set: StudySet
  onClose: () => void
  /** コピーはその場のダイアログで行うため, 呼び出し側に開いてもらう */
  onCopy: () => void
}

/**
 * 学習セットの操作 ( コピー・統合・分割 ) の一覧 ( specs.md §4.9 ).
 * セット詳細の ⋯ とホームの学習セットの行の ⋯ で共用する. 開くときに描画し, 閉じたら外す前提.
 */
export function SetActionsSheet({ set, onClose, onCopy }: SetActionsSheetProps) {
  const navigate = useNavigate()
  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <Modal open title={set.name} variant="sheet" onClose={onClose}>
      <div className="menu">
        <button
          type="button"
          className="menu__item"
          onClick={() => {
            onClose()
            onCopy()
          }}
        >
          <Icon name="copy" />
          セットをコピー
        </button>
        <button type="button" className="menu__item" onClick={() => go(`/sets/${set.id}/merge`)}>
          <Icon name="merge" />
          他のセットと統合
        </button>
        <button type="button" className="menu__item" onClick={() => go(`/sets/${set.id}/split`)}>
          <Icon name="split" />
          セットを分割
        </button>
      </div>
    </Modal>
  )
}
