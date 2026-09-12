import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder } from '../../core/types'
import { listFolders } from '../../core/db/folders'
import { getRichContentUsage, type RichContentUsage } from '../../core/db/assets'
import { getSet, updateRichContent } from '../../core/db/sets'
import { formatBytes } from '../../core/media/compress'
import { Breadcrumb } from '../components/Breadcrumb'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { Toggle } from '../components/Toggle'
import { useGoBack } from '../hooks/useGoBack'

const EMPTY_USAGE: RichContentUsage = { images: 0, bytes: 0, mathCards: 0 }

/** 無効にしようとしている対象。確認ダイアログの文面を切り替えるために持つ */
type Disabling = 'images' | 'math'

/**
 * S10 セット設定. リッチコンテンツの有効化 (specs.md §3, §4.4.1).
 *
 * 有効にするのは即時に反映する. 無効にするときだけ, そのセットに画像や数式があれば
 * 確認を挟む. データは消さず表示だけを戻すことを, その場で伝えるためである.
 */
export function SetSettingsScreen() {
  const { setId = '' } = useParams<{ setId: string }>()
  const goBack = useGoBack(`/sets/${setId}`)
  const [disabling, setDisabling] = useState<Disabling | null>(null)

  const set = useLiveQuery(async () => (await getSet(setId)) ?? null, [setId])
  const folders = useLiveQuery(() => listFolders(), [], [] as Folder[])
  const usage = useLiveQuery(() => getRichContentUsage(setId), [setId], EMPTY_USAGE)

  if (set === undefined) return <p className="empty">読み込み中…</p>
  if (set === null) {
    return (
      <div className="screen">
        <p className="empty">この学習セットは見つかりませんでした。</p>
        <Link className="btn" to="/">
          ホームへ戻る
        </Link>
      </div>
    )
  }

  const apply = (values: { enableImages?: boolean; enableMath?: boolean }) => {
    void updateRichContent(setId, {
      enableImages: values.enableImages ?? set.enableImages,
      enableMath: values.enableMath ?? set.enableMath,
    })
  }

  /** 無効にする操作。中身があるときだけ確認を挟む (specs.md §4.4.1) */
  const request = (target: Disabling, next: boolean) => {
    if (next) {
      apply(target === 'images' ? { enableImages: true } : { enableMath: true })
      return
    }
    const affected = target === 'images' ? usage.images : usage.mathCards
    if (affected === 0) {
      apply(target === 'images' ? { enableImages: false } : { enableMath: false })
      return
    }
    setDisabling(target)
  }

  return (
    <div className="screen">
      <Breadcrumb
        folders={folders}
        folderId={set.folderId}
        current={set.name}
        currentSetId={set.id}
      />

      <header className="screen__head">
        <div>
          <h1 className="screen__title">セットの設定</h1>
          <p className="screen__desc">{set.name}</p>
        </div>
        <div className="screen__actions">
          <button type="button" className="btn" onClick={goBack}>
            戻る
          </button>
        </div>
      </header>

      <section className="section">
        <h2 className="section__title">リッチコンテンツ</h2>
        <p className="note">
          文字だけで足りるセットに余計な仕組みを持ち込まないよう、セットごとに切り替えます。
        </p>

        <Toggle
          label="画像を使う"
          description="カードの表と裏に1枚ずつ画像を添付できるようになります。"
          checked={set.enableImages}
          onChange={(next) => request('images', next)}
        />
        <Toggle
          label="数式を使う"
          description="$ ... $ と $$ ... $$ を数式として表示します。"
          checked={set.enableMath}
          onChange={(next) => request('math', next)}
        />
      </section>

      <section className="section">
        <h2 className="section__title">このセットの中身</h2>
        <ul className="usage">
          <li className="usage__item">
            <Icon name="image" size={16} />
            画像 {usage.images} 枚 ({formatBytes(usage.bytes)})
          </li>
          <li className="usage__item">
            <Icon name="math" size={16} />
            数式を含むカード {usage.mathCards} 枚
          </li>
        </ul>
        <p className="note">
          無効にしてもデータは削除されません。再び有効にすれば元どおりに表示されます。
        </p>
      </section>

      <Modal
        open={disabling !== null}
        title={disabling === 'images' ? '画像を無効にする' : '数式を無効にする'}
        onClose={() => setDisabling(null)}
      >
        <div className="form">
          {disabling === 'images' ? (
            <p>
              このセットには画像 {usage.images} 枚があります。無効にしても
              <strong>データは削除されません</strong>が、画像は表示されなくなります。
              再び有効にすれば元に戻ります。
            </p>
          ) : (
            <p>
              このセットには数式を含むカード {usage.mathCards} 枚があります。無効にしても
              <strong>データは削除されません</strong>が、入力した LaTeX
              の文字列がそのまま表示されます。再び有効にすれば元に戻ります。
            </p>
          )}
          <div className="form__actions">
            <button type="button" className="btn" onClick={() => setDisabling(null)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                apply(disabling === 'images' ? { enableImages: false } : { enableMath: false })
                setDisabling(null)
              }}
            >
              無効にする
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
