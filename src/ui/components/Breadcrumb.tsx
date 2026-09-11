import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Folder } from '../../core/types'
import { getFolderPath } from '../../core/db/folders'
import { FolderSheet } from './FolderSheet'
import { Icon } from './Icon'

interface BreadcrumbProps {
  folders: readonly Folder[]
  folderId: string | null
  /** 経路の末尾に置く現在位置の名称 ( 学習セット名など ) */
  current?: string
  /** 今開いている学習セット. フォルダの一覧で強調するために渡す */
  currentSetId?: string
}

/**
 * 現在位置を示すパンくずリスト ( specs.md §4.1 ).
 *
 * 中間のフォルダ名は押せるようにしてあり, そのフォルダの中身を一覧するシートを開く.
 * 「ホーム」はホーム画面への移動, 末尾の現在地は表示のみとする.
 */
export function Breadcrumb({ folders, folderId, current, currentSetId }: BreadcrumbProps) {
  const path = getFolderPath(folders, folderId)
  // undefined は閉じている状態. null は最上位を開いている状態で, 両者を区別する
  const [sheetFolderId, setSheetFolderId] = useState<string | null | undefined>(undefined)
  // 開くたびにシートを作り直し, 前回潜った階層を持ち越さないようにする
  const [openCount, setOpenCount] = useState(0)

  return (
    <nav className="breadcrumb" aria-label="現在位置">
      {/* 経路の起点であると同時にホームへの入口でもあるため, 家の印を添える */}
      <Link to="/" className="breadcrumb__link">
        <Icon name="home" size={14} />
        ホーム
      </Link>
      {path.map((folder) => (
        <span key={folder.id}>
          <span className="breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <button
            type="button"
            className="breadcrumb__item breadcrumb__folder"
            aria-haspopup="dialog"
            title={`${folder.name} の中身を見る`}
            onClick={() => {
              setSheetFolderId(folder.id)
              setOpenCount((count) => count + 1)
            }}
          >
            {folder.name}
            <Icon name="chevron-down" size={12} />
          </button>
        </span>
      ))}
      {current !== undefined && (
        <span>
          <span className="breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="breadcrumb__item breadcrumb__item--current">{current}</span>
        </span>
      )}

      {sheetFolderId !== undefined && (
        <FolderSheet
          key={openCount}
          startFolderId={sheetFolderId}
          folders={folders}
          currentSetId={currentSetId}
          currentFolderId={folderId}
          onClose={() => setSheetFolderId(undefined)}
        />
      )}
    </nav>
  )
}
