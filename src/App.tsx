import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { firebaseReady } from './firebase'
import { useEntries } from './hooks/useEntries'
import type { MediaKind, WatchEntry } from './types'
import { isHttpUrl } from './types'

type ShelfFilter = 'all' | MediaKind

function App() {
  if (!firebaseReady) return <SetupScreen />
  return <Shelf />
}

function Shelf() {
  const { entries, addEntry, setRating, removeEntry, ready, error } = useEntries()
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter],
  )
  const rated = entries.filter((entry) => entry.rating > 0)
  const average = rated.length
    ? Math.round((rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length) * 10) / 10
    : null

  return (
    <div className="room">
      <header className="top">
        <div>
          <p className="mark">личная полка</p>
          <h1>Смотрел</h1>
        </div>
        <p className="stats">
          {ready
            ? `${entries.length} на полке${average !== null ? ` · средняя ${average}` : ''}`
            : 'открываем полку…'}
        </p>
      </header>

      <div className="toolbar">
        <div className="filters" role="tablist" aria-label="Что показать">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            всё
          </FilterChip>
          <FilterChip active={filter === 'movie'} onClick={() => setFilter('movie')}>
            фильмы
          </FilterChip>
          <FilterChip active={filter === 'series'} onClick={() => setFilter('series')}>
            сериалы
          </FilterChip>
        </div>
        <button type="button" className="text-action" onClick={() => setComposerOpen((open) => !open)}>
          {composerOpen ? 'закрыть' : 'поставить на полку'}
        </button>
      </div>

      {error ? <p className="banner">{error}</p> : null}
      {composerOpen ? (
        <Composer
          onSubmit={async (input) => {
            await addEntry(input)
            setComposerOpen(false)
          }}
        />
      ) : null}

      {ready && visible.length === 0 ? (
        <p className="empty">Полка пустая. Поставь первый фильм или сериал.</p>
      ) : (
        <ul className="shelf">
          {visible.map((entry) => (
            <Case
              key={entry.id}
              entry={entry}
              onRate={(rating) => void setRating(entry.id, rating)}
              onRemove={() => void removeEntry(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button type="button" role="tab" aria-selected={active} className={active ? 'filter is-on' : 'filter'} onClick={onClick}>
      {children}
    </button>
  )
}

function Composer({
  onSubmit,
}: {
  onSubmit: (input: { title: string; kind: MediaKind; cover?: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<MediaKind>('movie')
  const [cover, setCover] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError('Нужно название.')
      return
    }
    if (cover.trim() && !isHttpUrl(cover)) {
      setError('Ссылка на постер должна начинаться с http:// или https://')
      return
    }
    setError(null)
    setPending(true)
    try {
      await onSubmit({ title: nextTitle, kind, cover: cover.trim() || undefined })
    } catch {
      setError('Не получилось сохранить.')
      setPending(false)
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label>
        Название
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название" />
      </label>
      <div className="kind" role="group" aria-label="Тип">
        <button type="button" className={kind === 'movie' ? 'is-on' : ''} onClick={() => setKind('movie')}>
          фильм
        </button>
        <button type="button" className={kind === 'series' ? 'is-on' : ''} onClick={() => setKind('series')}>
          сериал
        </button>
      </div>
      <label>
        Постер
        <input value={cover} onChange={(event) => setCover(event.target.value)} placeholder="https://..." />
      </label>
      <div className="composer-foot">
        <button type="submit" className="text-action" disabled={pending}>
          {pending ? 'ставим…' : 'поставить'}
        </button>
        {error ? <p>{error}</p> : null}
      </div>
    </form>
  )
}

function Case({
  entry,
  onRate,
  onRemove,
}: {
  entry: WatchEntry
  onRate: (rating: number) => void
  onRemove: () => void
}) {
  const [broken, setBroken] = useState(false)
  return (
    <li className="case">
      <div className="poster">
        {entry.cover && !broken ? (
          <img src={entry.cover} alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="poster-fallback">{entry.kind === 'series' ? 'сериал' : 'фильм'}</span>
        )}
      </div>
      <div className="caption">
        <div className="caption-head">
          <h2>{entry.title}</h2>
          <button type="button" className="remove" onClick={onRemove} aria-label={`Убрать ${entry.title}`}>
            убрать
          </button>
        </div>
        <p className="kind-label">{entry.kind === 'series' ? 'сериал' : 'фильм'}</p>
        <Hearts value={entry.rating} onChange={onRate} label={`Оценка: ${entry.title}`} />
      </div>
    </li>
  )
}

function Hearts({ value, onChange, label }: { value: number; onChange: (rating: number) => void; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <div className="hearts" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(null)}>
      {Array.from({ length: 10 }, (_, index) => {
        const score = index + 1
        return (
          <button
            key={score}
            type="button"
            className={score <= shown ? 'heart is-on' : 'heart'}
            aria-label={`${score} из 10`}
            aria-pressed={value === score}
            onMouseEnter={() => setHover(score)}
            onFocus={() => setHover(score)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(value === score ? 0 : score)}
          >
            ♥
          </button>
        )
      })}
    </div>
  )
}

function SetupScreen() {
  return (
    <div className="room setup">
      <p className="mark">нужна новая база</p>
      <h1>Смотрел</h1>
      <p className="setup-copy">
        Старый Firebase-проект удалён. Создай новый проект, включи Firestore и положи ключи веб-приложения в файл
        <code> .env.local </code>
        рядом с <code>.env.example</code>. После этого перезапусти <code>npm run dev</code>.
      </p>
    </div>
  )
}

export default App
