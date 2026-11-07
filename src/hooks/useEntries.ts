import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { MediaKind, WatchEntry } from '../types'

export type NewEntry = {
  title: string
  kind: MediaKind
  cover?: string
}

function clampRating(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(10, Math.max(0, Math.round(value)))
}

export function useEntries() {
  const [entries, setEntries] = useState<WatchEntry[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return
    const entriesQuery = query(collection(db, 'entries'), orderBy('createdAt', 'desc'))
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
          return [
            {
              id: item.id,
              title,
              kind,
              rating: clampRating(typeof data.rating === 'number' ? data.rating : 0),
              cover: cover || undefined,
              createdAt,
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

  async function addEntry(input: NewEntry) {
    if (!db) return
    const title = input.title.trim()
    if (!title) return
    await addDoc(collection(db, 'entries'), {
      title,
      kind: input.kind,
      rating: 0,
      cover: input.cover?.trim() || null,
      createdAt: serverTimestamp(),
    })
  }

  async function setRating(id: string, rating: number) {
    if (!db) return
    await updateDoc(doc(db, 'entries', id), { rating: clampRating(rating) })
  }

  async function removeEntry(id: string) {
    if (!db) return
    await deleteDoc(doc(db, 'entries', id))
  }

  return { entries, addEntry, setRating, removeEntry, ready, error }
}
