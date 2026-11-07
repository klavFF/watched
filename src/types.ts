export type MediaKind = 'movie' | 'series'

export type WatchEntry = {
  id: string
  title: string
  kind: MediaKind
  rating: number
  cover?: string
  createdAt: number
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}
