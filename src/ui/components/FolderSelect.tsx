import type { Folder } from '../../core/types'
import { collectSubtreeIds, listChildFolders } from '../../core/db/folders'

interface FolderSelectProps {
  folders: readonly Folder[]
  value: string | null
  onChange: (folderId: string | null) => void
  /** 指定したフォルダとその子孫を選択肢から外す. 循環参照になる移動先を選ばせないため */
  excludeSubtreeOf?: string
  id?: string
}

const ROOT_VALUE = '__root__'

interface Option {
  id: string
  label: string
}

function flatten(folders: readonly Folder[], parentId: string | null, depth: number): Option[] {
  return listChildFolders(folders, parentId).flatMap((folder) => [
    { id: folder.id, label: `${'　'.repeat(depth)}${folder.name}` },
    ...flatten(folders, folder.id, depth + 1),
  ])
}

/** 所属フォルダを選ぶプルダウン. 階層は全角空白の字下げで表す */
export function FolderSelect({
  folders,
  value,
  onChange,
  excludeSubtreeOf,
  id,
}: FolderSelectProps) {
  const excluded =
    excludeSubtreeOf === undefined ? [] : collectSubtreeIds(folders, excludeSubtreeOf)
  const options = flatten(folders, null, 0).filter((option) => !excluded.includes(option.id))

  return (
    <select
      id={id}
      className="input"
      value={value ?? ROOT_VALUE}
      onChange={(event) =>
        onChange(event.target.value === ROOT_VALUE ? null : event.target.value)
      }
    >
      <option value={ROOT_VALUE}>(ルート)</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
