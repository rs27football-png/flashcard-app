// バックアップの催促と容量の警告の判定 (specs.md §6.2 P3, P4).
//
// 画面に出すかどうかだけを決める純粋な関数として置く. 読み出しは呼び出し側が行う.

/** この日数だけ外部に保存していなければ催促する */
export const REMIND_AFTER_DAYS = 14

const DAY = 24 * 60 * 60 * 1000

/** 使用量がこの割合を超えたら警告する */
export const STORAGE_WARN_RATIO = 0.8

export interface BackupStatus {
  /** 最後に書き出した日時 */
  lastBackupAt: number | null
  /** 最後に取り込んだ日時 */
  lastImportAt: number | null
  /** 学習セットの updatedAt の最大値. データがなければ null */
  latestUpdatedAt: number | null
  /** 最初に学習セットを作った日時. データがなければ null */
  firstCreatedAt: number | null
  now: number
}

/**
 * バックアップを促すか (specs.md §6.2 P3).
 *
 * 書き出しでも取り込みでも, その時点の内容は端末の外にも存在する. したがって
 * 「外部のファイルと一致した時点」はその新しいほうであり, それより後に変更が
 * なければ, この端末にしかないものは存在しないため催促しない.
 *
 * 一度も書き出しも取り込みもしていない場合は, 最初の学習セットを作った時点から
 * 数える. 使い始めた当日に催促が出るのを避けるためである.
 */
export function needsBackupReminder(status: BackupStatus): boolean {
  if (status.latestUpdatedAt === null || status.firstCreatedAt === null) return false

  const syncedAt = Math.max(status.lastBackupAt ?? 0, status.lastImportAt ?? 0)
  // 外部のファイルと一致した時点より後の変更がなければ, 失うものがない
  if (status.latestUpdatedAt <= syncedAt) return false

  const since = syncedAt > 0 ? syncedAt : status.firstCreatedAt
  return status.now - since >= REMIND_AFTER_DAYS * DAY
}

/** 催促の文面に添える日数. 起点からの経過日数を返す */
export function daysSinceSynced(status: BackupStatus): number {
  const syncedAt = Math.max(status.lastBackupAt ?? 0, status.lastImportAt ?? 0)
  const since = syncedAt > 0 ? syncedAt : (status.firstCreatedAt ?? status.now)
  return Math.floor((status.now - since) / DAY)
}

/** 保存領域が逼迫しているか (specs.md §6.2 P4). 割当が分からない環境では判定しない */
export function isStorageTight(usage: number | null, quota: number | null): boolean {
  if (usage === null || quota === null || quota === 0) return false
  return usage / quota >= STORAGE_WARN_RATIO
}
