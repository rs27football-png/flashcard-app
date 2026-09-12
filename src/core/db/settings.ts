import type { AppSettings } from '../types'
import { db } from './db'

/** アプリ設定の既定値 (specs.md §2.8) */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'system',
  showShortcutHints: true,
  quizAffectsProgress: true,
  imageMaxEdge: 1600,
  lastBackupAt: null,
}

/**
 * アプリ設定を読む. 保存されていない項目は既定値で補う.
 * 設定画面 (S9) を作るまでは何も保存されないため, 常に既定値が返る.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const stored = await db.settings.get('app')
  return { ...DEFAULT_APP_SETTINGS, ...stored }
}

/**
 * 設定を書き換える. 触れなかった項目は今の値のまま残す (specs.md §4.12).
 * 単一レコードのため put で丸ごと置き, 読み出し側の既定値と食い違わないようにする.
 */
export async function updateAppSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const current = await getAppSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}

/** 最終バックアップ日時を記録する (specs.md §2.8) */
export async function markBackedUp(at: number = Date.now()): Promise<void> {
  await updateAppSettings({ lastBackupAt: at })
}
