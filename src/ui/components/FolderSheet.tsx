import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder, StudySet } from '../../core/types'
import { getFolderPath, listChildFolders } from '../../core/db/folders'
import { countCardsPerSet, listAllSets } from '../../core/db/sets'
import { Icon } from './Icon'
import { Modal } from './Modal'

interface FolderSheetProps {
  /** 最初に中身を見せるフォルダ. null は最上位 */
  startFolderId: string | null
  folders: readonly Folder[]
  /** 今開いている学習セット. 一覧で強調する */
  currentSetId?: string
  /** 今開いている学習セットの所属フォルダ. そこまでの経路上のフォルダを強調する */
  currentFolderId: string | null
  onClose: () => void
}

/**
 * パンくずのフォルダ名から開く, フォルダの中身の一覧 (specs.md §4.1).
 *
 * 本アプリにはフォルダ単位の画面がない. 画面を離れずに階層を行き来できるよう,
 * 下位フォルダを選んだらこのシートの中で潜り, 学習セットを選んだ時点で移動する.
 * 開くたびに作り直す前提 (呼び出し側で key を変える) で, 見ている階層は内部で持つ.
 */
export function FolderSheet({
  startFolderId,
  folders,
  currentSetId,
  currentFolderId,
  onClose,
}: FolderSheetProps) {
  const navigate = useNavigate()
  const [browseId, setBrowseId] = useState<string | null>(startFolderId)
  const sets = useLiveQuery(() => listAllSets(), [], [] as StudySet[])
  const cardCounts = useLiveQuery(() => countCardsPerSet(), [], new Map<string, number>())

  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const browsing = browseId === null ? null : (byId.get(browseId) ?? null)
  const parentId = browsing?.parentId ?? null
  const parentLabel = parentId === null ? 'ルート' : (byId.get(parentId)?.name ?? 'ルート')
  // 現在地までの経路. 潜った先で「自分がどこから来たか」を見失わないようにする
  const pathIds = new Set(getFolderPath(folders, currentFolderId).map((folder) => folder.id))

  const childFolders = listChildFolders(folders, browseId)
  const childSets = sets
    .filter((set) => set.folderId === browseId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)

  const openSet = (setId: string) => {
    onClose()
    // どの画面から開いても行き先はセット詳細に揃える (specs.md §4.1)
    if (setId !== currentSetId) navigate(`/sets/${setId}`)
  }

  return (
    <Modal open title={browsing?.name ?? 'ルート'} variant="sheet" onClose={onClose}>
      <ul className="sheet-list">
        {browseId !== null && (
          <li>
            <button
              type="button"
              className="sheet-row sheet-row--back"
              onClick={() => setBrowseId(parentId)}
            >
              <Icon name="chevron-right" size={16} className="icon--flip" />
              <span className="sheet-row__label">{parentLabel}</span>
            </button>
          </li>
        )}

        {childFolders.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              className={`sheet-row ${pathIds.has(folder.id) ? 'sheet-row--on-path' : ''}`}
              onClick={() => setBrowseId(folder.id)}
            >
              <Icon name="folder" className="icon--folder" />
              <span className="sheet-row__label">{folder.name}</span>
              <Icon name="chevron-right" size={16} className="sheet-row__chevron" />
            </button>
          </li>
        ))}

        {childSets.map((set) => {
          const isCurrent = set.id === currentSetId
          return (
            <li key={set.id}>
              <button
                type="button"
                className={`sheet-row ${isCurrent ? 'sheet-row--current' : ''}`}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => openSet(set.id)}
              >
                <Icon name="set" className="icon--set" />
                <span className="sheet-row__label">{set.name}</span>
                {isCurrent && <span className="sheet-badge">現在</span>}
                <span className="sheet-row__meta">{cardCounts.get(set.id) ?? 0} 枚</span>
              </button>
            </li>
          )
        })}
      </ul>

      {childFolders.length === 0 && childSets.length === 0 && (
        <p className="sheet-empty">このフォルダは空です.</p>
      )}
    </Modal>
  )
}
