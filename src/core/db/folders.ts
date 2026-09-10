import type { Folder } from '../types'
import { db, newId, nextOrder } from './db'
import { deleteSets } from './sets'

/** 削除の巻き添え範囲. トランザクションに含めるテーブルをここに集約する */
const DELETE_SCOPE = [db.folders, db.sets, db.cards, db.progress, db.assets, db.sessions]

/** フォルダ削除時の挙動 ( specs.md §4.1 ) */
export type FolderDeleteMode =
  /** 配下の下位フォルダと学習セットもまとめて削除する */
  | 'cascade'
  /** 配下を直下からルートへ移し, 当該フォルダのみ削除する */
  | 'promote'

export function listFolders(): Promise<Folder[]> {
  return db.folders.toArray()
}

/** 指定フォルダ直下の下位フォルダを表示順で返す. parentId が null ならルート直下 */
export function listChildFolders(
  folders: readonly Folder[],
  parentId: string | null,
): Folder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const now = Date.now()
  const folders = await listFolders()
  const folder: Folder = {
    id: newId(),
    name: name.trim(),
    parentId,
    order: nextOrder(listChildFolders(folders, parentId)),
    createdAt: now,
    updatedAt: now,
  }
  await db.folders.add(folder)
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim(), updatedAt: Date.now() })
}

/**
 * 自身と, 自身の子孫すべての ID を返す.
 * 循環参照の検査と一括削除の双方で使う.
 */
export function collectSubtreeIds(folders: readonly Folder[], rootId: string): string[] {
  const ids = [rootId]
  // 再帰ではなく待ち行列で辿る. 階層の深さに制限を設けない仕様のため, 深い階層でも
  // スタックを消費しないようにしておく.
  for (let index = 0; index < ids.length; index += 1) {
    const currentId = ids[index]
    for (const folder of folders) {
      if (folder.parentId === currentId) ids.push(folder.id)
    }
  }
  return ids
}

/**
 * フォルダを移動する. 移動先が自身または自身の子孫であれば拒否する ( specs.md §4.1 ).
 * これを許すと親子関係が輪になり, ツリーの探索が終わらなくなる.
 */
export async function moveFolder(id: string, newParentId: string | null): Promise<void> {
  const folders = await listFolders()
  if (newParentId !== null && collectSubtreeIds(folders, id).includes(newParentId)) {
    throw new Error('自身または自身の配下のフォルダへは移動できません.')
  }
  await db.folders.update(id, {
    parentId: newParentId,
    order: nextOrder(listChildFolders(folders, newParentId)),
    updatedAt: Date.now(),
  })
}

/** 削除の確認ダイアログに出す, 配下の件数 ( specs.md §4.1 ) */
export interface FolderContents {
  folderCount: number
  setCount: number
  cardCount: number
}

export async function countFolderContents(id: string): Promise<FolderContents> {
  const folders = await listFolders()
  const subtreeIds = collectSubtreeIds(folders, id)
  const sets = await db.sets.toArray()
  const targetSets = sets.filter(
    (set) => set.folderId !== null && subtreeIds.includes(set.folderId),
  )
  let cardCount = 0
  for (const set of targetSets) {
    cardCount += await db.cards.where('setId').equals(set.id).count()
  }
  return {
    folderCount: subtreeIds.length - 1, // 自身を除いた下位フォルダの数
    setCount: targetSets.length,
    cardCount,
  }
}

export async function deleteFolder(id: string, mode: FolderDeleteMode): Promise<void> {
  const folders = await listFolders()

  if (mode === 'cascade') {
    // セットの削除とフォルダの削除を1つのトランザクションにまとめる.
    // 途中で失敗したときに, 中身だけ消えてフォルダが residue として残るのを避けるため.
    await db.transaction('rw', DELETE_SCOPE, async () => {
      const subtreeIds = collectSubtreeIds(folders, id)
      const sets = await db.sets.toArray()
      const targetSetIds = sets
        .filter((set) => set.folderId !== null && subtreeIds.includes(set.folderId))
        .map((set) => set.id)
      await deleteSets(targetSetIds)
      await db.folders.bulkDelete(subtreeIds)
    })
    return
  }

  // promote: 直下の下位フォルダと学習セットをルートへ移してから, 当該フォルダだけを消す
  await db.transaction('rw', db.folders, db.sets, async () => {
    const now = Date.now()
    const rootFolders = listChildFolders(folders, null)
    let folderOrder = nextOrder(rootFolders)
    for (const child of listChildFolders(folders, id)) {
      await db.folders.update(child.id, {
        parentId: null,
        order: folderOrder,
        updatedAt: now,
      })
      folderOrder += 1
    }

    const sets = await db.sets.toArray()
    let setOrder = nextOrder(sets.filter((set) => set.folderId === null))
    for (const set of sets.filter((set) => set.folderId === id)) {
      await db.sets.update(set.id, { folderId: null, order: setOrder, updatedAt: now })
      setOrder += 1
    }

    await db.folders.delete(id)
  })
}

/** ルートから当該フォルダまでの経路. パンくずリストに用いる ( specs.md §4.1 ) */
export function getFolderPath(
  folders: readonly Folder[],
  folderId: string | null,
): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  let currentId = folderId
  while (currentId !== null) {
    const folder = byId.get(currentId)
    if (!folder) break
    path.unshift(folder)
    currentId = folder.parentId
  }
  return path
}
