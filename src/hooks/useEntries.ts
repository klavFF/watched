import { useEffect, useRef, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { MediaKind, WatchEntry } from '../types'

export type NewEntry = {
  title: string
  kind: MediaKind
  cover?: string
  rating?: number
}

function clampRating(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(10, Math.max(0, Math.round(value)))
}

function compareMovies(a: WatchEntry, b: WatchEntry) {
  if (a.rating !== b.rating) return b.rating - a.rating
  const aHas = typeof a.position === 'number'
  const bHas = typeof b.position === 'number'
  if (aHas && bHas && a.position !== b.position) return a.position! - b.position!
  if (aHas !== bHas) return aHas ? -1 : 1
  return b.createdAt - a.createdAt
}

function sameRating(entries: WatchEntry[], rating: number) {
  return sortMovies(entries).filter((movie) => movie.rating === rating)
}

function endPosition(group: WatchEntry[]) {
  const positions = group.flatMap((movie) => (typeof movie.position === 'number' ? [movie.position] : []))
  if (positions.length === 0 || positions.length !== group.length) return group.length
  return Math.max(...positions) + 1
}

export function sortMovies(entries: WatchEntry[]) {
  return entries.filter((entry) => entry.kind === 'movie').sort(compareMovies)
}

export function useEntries() {
  const [entries, setEntries] = useState<WatchEntry[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entriesRef = useRef<WatchEntry[]>([])
  entriesRef.current = entries

  useEffect(() => {
    if (!db) return
    const entriesQuery = query(collection(db, 'entries'))
    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const next = snapshot.docs.flatMap((item) => {
          const data = item.data()
          const title = typeof data.title === 'string' ? data.title.trim() : ''
          const kind = data.kind === 'series' ? 'series' : data.kind === 'movie' ? 'movie' : null
          if (!title || !kind) return []
          const cover = typeof data.cover === 'string' ? data.cover.trim() : ''
          const createdAt = typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0
          const position = typeof data.position === 'number' ? data.position : undefined
          return [
            {
              id: item.id,
              title,
              kind,
              rating: clampRating(typeof data.rating === 'number' ? data.rating : 0),
              cover: cover || undefined,
              createdAt,
              position,
            } satisfies WatchEntry,
          ]
        })
        setEntries(next)
        setReady(true)
        setError(null)
      },
      (snapshotError) => {
        setReady(true)
        setError(
          snapshotError.code === 'permission-denied'
            ? 'Нет доступа к базе. Опубликуй правила Firestore.'
            : 'Не получилось загрузить полку.',
        )
      },
    )
    return unsubscribe
  }, [])

  function savePositions(database: NonNullable<typeof db>, batch: ReturnType<typeof writeBatch>, movies: WatchEntry[]) {
    movies.forEach((movie, position) => {
      if (movie.position !== position) batch.update(doc(database, 'entries', movie.id), { position })
    })
  }

  async function addEntry(input: NewEntry) {
    if (!db) return
    const title = input.title.trim()
    if (!title) return
    const rating = clampRating(input.rating ?? 0)
    const group = sameRating(entriesRef.current, rating)
    const batch = writeBatch(db)
    if (group.some((movie) => typeof movie.position !== 'number')) savePositions(db, batch, group)
    const entry = doc(collection(db, 'entries'))
    batch.set(entry, {
      title,
      kind: input.kind,
      rating,
      cover: input.cover?.trim() || null,
      createdAt: serverTimestamp(),
      position: endPosition(group),
    })
    await batch.commit()
  }

  async function renameEntry(id: string, title: string) {
    if (!db) return
    const next = title.trim()
    if (!next || next.length >= 160) return
    await updateDoc(doc(db, 'entries', id), { title: next })
  }

  async function setRating(id: string, rating: number) {
    if (!db) return
    const nextRating = clampRating(rating)
    const ordered = sortMovies(entriesRef.current)
    const movie = ordered.find((item) => item.id === id)
    if (!movie || movie.rating === nextRating) return
    const previous = ordered.filter((item) => item.rating === movie.rating && item.id !== id)
    const destination = ordered.filter((item) => item.rating === nextRating)
    const batch = writeBatch(db)
    savePositions(db, batch, previous)
    batch.update(doc(db, 'entries', id), { rating: nextRating, position: endPosition(destination) })
    await batch.commit()
  }

  async function placeEntry(id: string, targetId: string, after: boolean) {
    if (!db || id === targetId) return
    const ordered = sortMovies(entriesRef.current)
    const movie = ordered.find((item) => item.id === id)
    const target = ordered.find((item) => item.id === targetId)
    if (!movie || !target || movie.rating !== target.rating) return
    const group = ordered.filter((item) => item.rating === movie.rating)
    const without = group.filter((item) => item.id !== id)
    let index = without.findIndex((item) => item.id === targetId)
    if (index < 0) return
    if (after) index += 1
    without.splice(index, 0, movie)
    if (without.every((item, position) => item.id === group[position]?.id)) return
    const batch = writeBatch(db)
    savePositions(db, batch, without)
    await batch.commit()
  }

  async function removeEntry(id: string) {
    if (!db) return
    const ordered = sortMovies(entriesRef.current)
    const movie = ordered.find((item) => item.id === id)
    const remaining = ordered.filter((item) => item.rating === movie?.rating && item.id !== id)
    const batch = writeBatch(db)
    batch.delete(doc(db, 'entries', id))
    savePositions(db, batch, remaining)
    await batch.commit()
  }

  return { entries, addEntry, renameEntry, setRating, placeEntry, removeEntry, ready, error }
}
