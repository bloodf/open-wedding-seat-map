/**
 * Purpose: Boots the React editor and registers the optional app-shell service
 *          worker after the first page load.
 *
 * Public API: browser entry point loaded by Vite from index.html.
 *
 * Upstream deps: React DOM, App shell, bundled i18n resources, browser service
 *                worker API.
 *
 * Downstream consumers: Vite build output and browser runtime.
 *
 * Failure modes: missing #root is a startup error; service-worker registration
 *                failures are ignored so the editor remains usable online.
 *
 * Performance: standard React root bootstrap; service-worker registration is
 *              deferred until window load.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './i18n'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
