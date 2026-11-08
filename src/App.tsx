import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { firebaseReady } from './firebase'
import { sortMovies, useEntries } from './hooks/useEntries'
import type { WatchEntry } from './types'
import { isHttpUrl } from './types'

function App() {
  if (!firebaseReady) return <SetupScreen />
  return <Movies />
}

function Movies() {
  const { entries, addEntry, renameEntry, setRating, placeEntry, removeEntry, ready, error } = useEntries()
  const [ordering, setOrdering] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; rating: number } | null>(null)
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const movies = useMemo(() => sortMovies(entries), [entries])
  const canReorder = useMemo(() => {
    const counts = new Map<number, number>()
    for (const movie of movies) counts.set(movie.rating, (counts.get(movie.rating) ?? 0) + 1)
    return [...counts.values()].some((count) => count > 1)
  }, [movies])
  const covers = useMemo(
    () => movies.flatMap((movie) => (movie.cover ? [movie.cover] : [])),
    [movies],
  )

  return (
    <div className="screen">
      <PosterWall covers={covers} />
      <div className="veil" />
      <main className="stage">
        <section className="board">
        <Composer
          onSubmit={async (input) => {
            await addEntry({ ...input, kind: 'movie' })
          }}
        />
        {error ? <p className="banner">{error}</p> : null}
        {orderError ? <p className="banner">{orderError}</p> : null}
        {ready && movies.length === 0 ? <p className="empty">Пока нет фильмов.</p> : null}
        {canReorder ? (
          <div className="order-bar">
            <button
              type="button"
              className={ordering ? 'order-toggle is-on' : 'order-toggle'}
              aria-pressed={ordering}
              onClick={() => {
                setOrdering((current) => !current)
                setDrag(null)
                setDrop(null)
              }}
            >
              {ordering ? 'готово' : 'порядок'}
            </button>
          </div>
        ) : null}
        {movies.length > 0 ? (
          <ul className="list">
            {movies.map((movie, index) => (
              <MovieRow
                key={movie.id}
                movie={movie}
                ordering={ordering && movies.some((item) => item.id !== movie.id && item.rating === movie.rating)}
                grouped={index > 0 && movies[index - 1].rating !== movie.rating}
                drop={drop?.id === movie.id ? (drop.after ? 'after' : 'before') : null}
                onRate={(rating) => void setRating(movie.id, rating)}
                onRename={(title) => renameEntry(movie.id, title)}
                onRemove={() => void removeEntry(movie.id)}
                onDragStart={() => setDrag({ id: movie.id, rating: movie.rating })}
                onDragEnd={() => {
                  setDrag(null)
                  setDrop(null)
                }}
                onDragOver={(after) => {
                  if (!drag || drag.rating !== movie.rating || drag.id === movie.id) return false
                  setDrop({ id: movie.id, after })
                  return true
                }}
                onDrop={(after) => {
                  if (!drag || drag.rating !== movie.rating || drag.id === movie.id) return
                  const sourceId = drag.id
                  setDrag(null)
                  setDrop(null)
                  void placeEntry(sourceId, movie.id, after).then(
                    () => setOrderError(null),
                    () => setOrderError('Не получилось сохранить порядок. Опубликуй новые правила Firestore.'),
                  )
                }}
              />
            ))}
          </ul>
        ) : null}
        </section>
      </main>
    </div>
  )
}

function PosterWall({ covers }: { covers: string[] }) {
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const [grid, setGrid] = useState({ columns: 16, rows: 8 })
  const usable = covers.filter((cover) => !broken[cover])

  useEffect(() => {
    function measure() {
      setGrid({
        columns: Math.ceil(window.innerWidth / 78) + 1,
        rows: Math.ceil(window.innerHeight / 104) + 1,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  if (usable.length === 0) return null

  return (
    <div className="wall" aria-hidden="true">
      {Array.from({ length: grid.rows }, (_, row) => {
        const strip = Array.from({ length: grid.columns }, (_, index) => usable[(index + row * 3) % usable.length])
        return (
          <div
            className={row % 2 === 0 ? 'wall-row' : 'wall-row is-reverse'}
            key={row}
            style={{ animationDuration: `${64 + row * 9}s` }}
          >
            {[strip, strip].map((copies, copy) => (
              <div className="wall-set" key={copy}>
                {copies.map((cover, index) => (
                  <img
                    key={`${row}-${copy}-${index}`}
                    src={cover}
                    alt=""
                    onError={() => setBroken((current) => ({ ...current, [cover]: true }))}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Composer({
  onSubmit,
}: {
  onSubmit: (input: { title: string; cover?: string; rating: number }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [cover, setCover] = useState('')
  const [rating, setRating] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

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
      await onSubmit({ title: nextTitle, cover: cover.trim() || undefined, rating })
      setTitle('')
      setCover('')
      setRating(0)
      setPending(false)
      setOpen(false)
    } catch {
      setError('Не получилось сохранить.')
      setPending(false)
    }
  }

  function toggle() {
    setOpen((current) => {
      const next = !current
      if (next) requestAnimationFrame(() => titleRef.current?.focus())
      return next
    })
  }

  return (
    <div className="composer">
      <button type="button" className={open ? 'reveal is-quiet' : 'reveal'} aria-expanded={open} onClick={toggle}>
        {open ? 'закрыть' : 'добавить фильм'}
      </button>
      <div className={open ? 'drawer is-open' : 'drawer'}>
        <div className="drawer-clip">
        <form className="panel" inert={!open} onSubmit={handleSubmit}>
          <label>
            Название
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Название фильма"
            />
          </label>
          <label>
            Постер
            <input value={cover} onChange={(event) => setCover(event.target.value)} placeholder="https://..." />
          </label>
          <div className="rating-field">
            <span>Оценка</span>
            <Stars value={rating} onChange={setRating} label="Оценка нового фильма" />
          </div>
          <div className="panel-foot">
            <button type="submit" disabled={pending}>
              {pending ? 'добавляем…' : 'добавить'}
            </button>
            {error ? <p>{error}</p> : null}
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

function MovieRow({
  movie,
  ordering,
  grouped,
  drop,
  onRate,
  onRename,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  movie: WatchEntry
  ordering: boolean
  grouped: boolean
  drop: 'before' | 'after' | null
  onRate: (rating: number) => void
  onRename: (title: string) => Promise<void>
  onRemove: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (after: boolean) => boolean
  onDrop: (after: boolean) => void
}) {
  const [broken, setBroken] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(movie.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const rowClass = ['movie', ordering ? 'is-ordering' : '', grouped ? 'is-group' : '', drop ? `is-drop-${drop}` : '']
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (!editing) setTitle(movie.title)
  }, [editing, movie.title])

  useEffect(() => {
    if (editing) titleRef.current?.focus()
  }, [editing])

  async function finishEditing() {
    const next = title.trim()
    if (!next || next.length >= 160) {
      setTitle(movie.title)
      setEditing(false)
      return
    }
    if (next !== movie.title) await onRename(next)
    setEditing(false)
  }

  function placeFromPointer(event: DragEvent<HTMLLIElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY > bounds.top + bounds.height / 2
  }

  return (
    <li
      className={rowClass}
      onDragOver={(event) => {
        const after = placeFromPointer(event)
        if (onDragOver(after)) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(placeFromPointer(event))
      }}
    >
      {ordering ? (
        <button
          type="button"
          className="handle"
          draggable
          aria-label={`Переместить ${movie.title}`}
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', movie.id)
            event.dataTransfer.effectAllowed = 'move'
            onDragStart()
          }}
          onDragEnd={onDragEnd}
        >
          ⋮⋮
        </button>
      ) : null}
      <div className="thumb">
        {movie.cover && !broken ? (
          <img src={movie.cover} alt="" onError={() => setBroken(true)} />
        ) : (
          <span>{movie.title.slice(0, 1)}</span>
        )}
      </div>
      {editing ? (
        <input
          ref={titleRef}
          className="title-input"
          value={title}
          aria-label={`Название: ${movie.title}`}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void finishEditing()
            if (event.key === 'Escape') {
              setTitle(movie.title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <h2 title={movie.title}>{movie.title}</h2>
      )}
      <Stars value={movie.rating} locked={!editing} onChange={onRate} label={`Оценка: ${movie.title}`} />
      <div className="row-actions">
        {editing ? (
          <button type="button" className="remove" onClick={onRemove} aria-label={`Убрать ${movie.title}`}>
            убрать
          </button>
        ) : null}
        <button
          type="button"
          className={editing ? 'pencil is-on' : 'pencil'}
          aria-pressed={editing}
          aria-label={editing ? `Закончить правку: ${movie.title}` : `Редактировать: ${movie.title}`}
          onClick={() => {
            if (editing) void finishEditing()
            else setEditing(true)
          }}
        >
          <PencilIcon />
        </button>
      </div>
    </li>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  )
}

function Stars({
  value,
  onChange,
  label,
  locked = false,
}: {
  value: number
  onChange: (rating: number) => void
  label: string
  locked?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  if (locked) {
    return (
      <div className="stars is-locked" aria-label={label}>
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} className={index < value ? 'star is-on' : 'star'} aria-hidden="true">
            ★
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="stars" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(null)}>
      {Array.from({ length: 10 }, (_, index) => {
        const score = index + 1
        return (
          <button
            key={score}
            type="button"
            className={score <= shown ? 'star is-on' : 'star'}
            aria-label={`${score} из 10`}
            aria-pressed={value === score}
            onMouseEnter={() => setHover(score)}
            onFocus={() => setHover(score)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(value === score ? 0 : score)}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}

function SetupScreen() {
  return (
    <div className="screen setup">
      <div className="veil" />
      <main className="stage">
        <p className="panel setup-copy">
          Нужна база. Создай проект Firebase, включи Firestore и положи ключи в <code>.env.local</code>. После этого
          перезапусти <code>npm run dev</code>.
        </p>
      </main>
    </div>
  )
}

export default App
