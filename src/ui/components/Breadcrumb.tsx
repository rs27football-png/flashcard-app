import { Link } from 'react-router-dom'
import type { Folder } from '../../core/types'
import { getFolderPath } from '../../core/db/folders'
import { Icon } from './Icon'

interface BreadcrumbProps {
  folders: readonly Folder[]
  folderId: string | null
  /** 経路の末尾に置く現在位置の名称 ( 学習セット名など ) */
  current?: string
}

/** 現在位置を示すパンくずリスト ( specs.md §4.1 ) */
export function Breadcrumb({ folders, folderId, current }: BreadcrumbProps) {
  const path = getFolderPath(folders, folderId)
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
          <span className="breadcrumb__item">{folder.name}</span>
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
    </nav>
  )
}
