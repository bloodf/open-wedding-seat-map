/**
 * Purpose: Renders the editor command bar for map identity, local status,
 *          language, import/export/share/save, and top-level editor commands.
 *
 * Public API: TopBar component.
 *
 * Upstream deps: lucide-react icons, react-i18next, EditorState data.
 *
 * Downstream consumers: App shell.
 *
 * Failure modes: command failures are surfaced through editor status state by
 *                App-level handlers.
 *
 * Performance: standard React render cost.
 */

import { ChevronDown, Download, FilePlus2, Globe2, Redo2, Save, Share2, Undo2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EditorAction, EditorState } from '../state/editorState'

type ExportFormat = 'json' | 'csv' | 'svg' | 'pdf'

interface TopBarProps {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  onNewMap: () => void
  onImport: () => void
  onExport: (format: ExportFormat) => void
  onShare: () => void
  onSave: () => void
}

export function TopBar({ state, dispatch, onNewMap, onImport, onExport, onShare, onSave }: TopBarProps) {
  const { t, i18n } = useTranslation()

  function handleLocaleChange(locale: EditorState['scene']['locale']): void {
    void i18n.changeLanguage(locale)
    dispatch({ type: 'setLocale', locale })
  }

  return (
    <header className="topbar" data-testid="editor-toolbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          W
        </div>
        <div>
          <strong>Wedding Seat Map</strong>
          <span>{t('brandSubtitle')}</span>
        </div>
      </div>

      <label className="map-title-control">
        <span>{t('map')}</span>
        <div className="select-shell">
          <select
            aria-label={t('map')}
            value={state.scene.name}
            onChange={(event) => dispatch({ type: 'setSceneName', name: event.target.value })}
          >
            <option value={state.scene.name}>{state.scene.name}</option>
            <option value="Reception floorplan">Reception floorplan</option>
            <option value="Ceremony and dinner">Ceremony and dinner</option>
          </select>
          <ChevronDown aria-hidden="true" size={15} />
        </div>
        <span className="current-map-name" data-testid="current-map-name">
          {state.scene.name}
        </span>
      </label>

      <div className="topbar__cluster" aria-label="History">
        <button type="button" className="icon-button" onClick={onNewMap} title={t('actions.newMap')} data-testid="new-map-button">
          <FilePlus2 aria-hidden="true" size={17} />
        </button>
        <button type="button" className="icon-button" disabled title="Undo is handled by a later slice">
          <Undo2 aria-hidden="true" size={17} />
        </button>
        <button type="button" className="icon-button" disabled title="Redo is handled by a later slice">
          <Redo2 aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="status-pill" aria-label={t('labels.saveStatus')}>
        <span className="status-dot" />
        {state.statusMessage || t('status.localDraft')}
      </div>

      <label className="language-control">
        <Globe2 aria-hidden="true" size={16} />
        <select
          aria-label={t('labels.language')}
          value={state.scene.locale}
          onChange={(event) => handleLocaleChange(event.target.value as EditorState['scene']['locale'])}
        >
          <option value="en">EN</option>
          <option value="pt-BR">PT-BR</option>
          <option value="es">ES</option>
        </select>
      </label>

      <div className="topbar__actions">
        <button type="button" className="text-button" onClick={onShare}>
          <Share2 aria-hidden="true" size={16} />
          {t('actions.share')}
        </button>
        {state.shareUrl ? (
          <input className="share-url" aria-label={t('labels.shareUrl')} value={state.shareUrl} readOnly />
        ) : null}
        <button type="button" className="text-button" onClick={onImport}>
          <Upload aria-hidden="true" size={16} />
          {t('actions.import')}
        </button>
        <div className="export-actions" aria-label="Export">
          <Download className="export-actions__icon" aria-hidden="true" size={15} />
          <button type="button" className="text-button compact" onClick={() => onExport('json')} data-testid="export-json-button">
            {t('actions.exportJson')}
          </button>
          <button type="button" className="text-button compact" onClick={() => onExport('csv')} data-testid="export-csv-button">
            {t('actions.exportCsv')}
          </button>
          <button type="button" className="text-button compact" onClick={() => onExport('svg')} data-testid="export-svg-button">
            {t('actions.exportSvg')}
          </button>
          <button type="button" className="text-button compact" onClick={() => onExport('pdf')} data-testid="export-pdf-button">
            {t('actions.exportPdf')}
          </button>
        </div>
        <button type="button" className="primary-button" onClick={onSave}>
          <Save aria-hidden="true" size={16} />
          {t('actions.save')}
        </button>
      </div>
    </header>
  )
}
