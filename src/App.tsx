/**
 * Purpose: Composes the first-screen professional editor shell for Wedding Seat
 *          Map and wires local import, export, seating, sharing, and draft
 *          persistence interactions.
 *
 * Public API: App component.
 *
 * Upstream deps: editor reducer, shell panels, canvas, import/export codecs,
 *                auto-seating solver, local draft storage, i18n runtime, CSS.
 *
 * Downstream consumers: src/main.tsx and browser/e2e smoke tests.
 *
 * Failure modes: invalid imports surface as status text; localStorage and
 *                clipboard failures fall back to status-only behavior; sharing
 *                is intentionally local/offline until remote persistence is wired.
 *
 * Performance: standard React reducer flow for editor-scale scenes.
 */

import { useEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { autoSeatScene } from './autoSeating'
import { Canvas } from './components/Canvas'
import { InspectorPanel } from './components/InspectorPanel'
import { PalettePanel } from './components/PalettePanel'
import { StatusStrip } from './components/StatusStrip'
import { TopBar } from './components/TopBar'
import i18n from './i18n'
import { exportSceneCsv, exportSceneJson, exportSceneSvg, generatePdfKit, importSceneCsv, importSceneJson, importSceneSvg } from './io'
import { loadLocalSceneDraft, saveLocalSceneDraft } from './offline/localSceneDraft'
import { createEditorStateFromScene, createInitialEditorState, editorReducer } from './state/editorState'
import './styles.css'

type ImportKind = 'any' | 'csv' | 'json' | 'svg'
type ExportFormat = 'json' | 'csv' | 'svg' | 'pdf'

export default function App() {
  const { t } = useTranslation()
  const anyFileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const [state, dispatch] = useReducer(editorReducer, undefined, () => {
    const draft = loadLocalSceneDraft()
    return draft ? createEditorStateFromScene(draft) : createInitialEditorState(navigator.language)
  })

  useEffect(() => {
    void i18n.changeLanguage(state.scene.locale)
  }, [state.scene.locale])

  useEffect(() => {
    saveLocalSceneDraft(state.scene)
  }, [state.scene])

  async function handleFileInput(event: React.ChangeEvent<HTMLInputElement>, kind: ImportKind): Promise<void> {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    try {
      await importFile(file, kind)
    } catch (error) {
      dispatch({
        type: 'setStatus',
        statusMessage: t('status.importFailed', { message: errorMessage(error) }),
      })
    }
  }

  async function importFile(file: File, kind: ImportKind): Promise<void> {
    const text = await file.text()
    const format = resolveImportFormat(file, text, kind)

    if (format === 'json') {
      const result = importSceneJson(text)
      dispatch({ type: 'replaceScene', scene: result.scene, statusMessage: t('status.importedScene') })
      return
    }

    if (format === 'csv') {
      const result = importSceneCsv(text)

      if (result.scene) {
        dispatch({ type: 'replaceScene', scene: result.scene, statusMessage: t('status.importedScene') })
        return
      }

      dispatch({
        type: 'mergeGuestImport',
        guests: result.guests,
        groups: result.groups,
        assignments: result.assignments,
        statusMessage: t('status.importedGuests'),
      })
      dispatch({ type: 'setView', view: 'guestList' })
      return
    }

    const result = importSceneSvg(text)
    if (result.kind === 'editable' && result.scene) {
      dispatch({ type: 'replaceScene', scene: result.scene, statusMessage: t('status.importedScene') })
      return
    }

    if (result.background) {
      dispatch({ type: 'addBackgroundSvg', background: result.background, statusMessage: t('status.importedBackground') })
    }
  }

  function handleExport(format: ExportFormat): void {
    try {
      const filename = `${slugify(state.scene.name)}.${format === 'pdf' ? 'pdf' : format}`

      if (format === 'json') {
        downloadBlob(exportSceneJson(state.scene), filename, 'application/json')
      } else if (format === 'csv') {
        downloadBlob(exportSceneCsv(state.scene), filename, 'text/csv')
      } else if (format === 'svg') {
        downloadBlob(exportSceneSvg(state.scene), filename, 'image/svg+xml')
      } else {
        downloadBlob(generatePdfKit(state.scene, { output: 'blob' }), filename, 'application/pdf')
      }

      dispatch({ type: 'setStatus', statusMessage: t('status.exported', { format: format.toUpperCase() }) })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        statusMessage: t('status.exportFailed', { message: errorMessage(error) }),
      })
    }
  }

  function handleSave(): void {
    dispatch({
      type: 'setStatus',
      statusMessage: saveLocalSceneDraft(state.scene) ? t('status.saved') : t('status.saveUnavailable'),
    })
  }

  function handleAutoSeat(): void {
    const result = autoSeatScene(state.scene)
    dispatch({
      type: 'applyAutoSeating',
      scene: result.scene,
      conflicts: result.conflicts,
      statusMessage:
        result.conflicts.length > 0
          ? t('status.autoSeatConflicts', { count: result.conflicts.length })
          : t('status.autoSeated'),
    })
  }

  async function handleShare(): Promise<void> {
    try {
      const shareUrl = createLocalShareUrl(state.scene.id, window.location.origin)

      try {
        await navigator.clipboard?.writeText(shareUrl)
      } catch {
        // Clipboard access can be blocked outside secure browser contexts.
      }
      dispatch({ type: 'setShareUrl', shareUrl, statusMessage: t('status.shareReady') })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        statusMessage: t('status.shareFailed', { message: errorMessage(error) }),
      })
    }
  }

  return (
    <div className="app-shell" data-testid="seat-map-editor">
      <TopBar
        state={state}
        dispatch={dispatch}
        onNewMap={() => dispatch({ type: 'resetScene' })}
        onImport={() => anyFileInputRef.current?.click()}
        onExport={handleExport}
        onShare={() => void handleShare()}
        onSave={handleSave}
      />
      <input
        ref={anyFileInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,.csv,.svg,application/json,text/csv,image/svg+xml"
        aria-label="Import scene file"
        data-testid="scene-file-input"
        onChange={(event) => void handleFileInput(event, 'any')}
      />
      <input
        ref={csvInputRef}
        className="visually-hidden"
        type="file"
        accept=".csv,text/csv"
        aria-label="Import guest CSV"
        data-testid="guest-csv-input"
        onChange={(event) => void handleFileInput(event, 'csv')}
      />
      <input
        ref={jsonInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="Import scene JSON"
        data-testid="scene-json-input"
        onChange={(event) => void handleFileInput(event, 'json')}
      />
      <input
        ref={svgInputRef}
        className="visually-hidden"
        type="file"
        accept=".svg,image/svg+xml"
        aria-label="Import scene SVG"
        data-testid="scene-svg-input"
        onChange={(event) => void handleFileInput(event, 'svg')}
      />
      <div className="editor-layout">
        <PalettePanel
          state={state}
          dispatch={dispatch}
          onImportGuests={() => csvInputRef.current?.click()}
          onAutoSeat={handleAutoSeat}
        />
        <Canvas state={state} dispatch={dispatch} />
        <InspectorPanel state={state} dispatch={dispatch} />
      </div>
      <StatusStrip state={state} dispatch={dispatch} />
    </div>
  )
}

function resolveImportFormat(file: File, text: string, kind: ImportKind): Exclude<ImportKind, 'any'> {
  if (kind !== 'any') return kind

  const name = file.name.toLowerCase()
  if (name.endsWith('.json') || file.type === 'application/json' || text.trimStart().startsWith('{')) return 'json'
  if (name.endsWith('.svg') || file.type === 'image/svg+xml' || text.trimStart().startsWith('<svg')) return 'svg'
  return 'csv'
}

function downloadBlob(content: string | Blob, filename: string, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function createLocalShareUrl(mapId: string, origin: string): string {
  const mapPath = `/m/${encodeURIComponent(mapId)}`
  const params = new URLSearchParams({ mode: 'local', role: 'edit' })
  return `${origin}${mapPath}?${params.toString()}#offline`
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')

  return slug || 'wedding-seat-map'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
