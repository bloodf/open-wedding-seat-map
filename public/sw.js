/* global caches, fetch, self */

/*
 * Purpose: Caches the Wedding Seat Map app shell for basic offline reloads.
 *
 * Public API: browser service-worker install, activate, and fetch event handlers.
 *
 * Upstream deps: Cache Storage API, Fetch API, same-origin app-shell assets.
 *
 * Downstream consumers: browser service-worker runtime registered by src/main.tsx.
 *
 * Failure modes: cache population can fail when assets are unavailable; fetch
 *                handling is limited to same-origin GET requests and should not
 *                be used for authenticated Supabase responses.
 *
 * Performance: cache-first for same-origin GET requests; network fallback on miss.
 */

const CACHE_NAME = 'wedding-seat-map-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/maskable-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
    }),
  )
})
