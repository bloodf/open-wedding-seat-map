/**
 * Purpose: Provides dense object, seating, and view controls for the editor
 *          sidebar.
 *
 * Public API: PalettePanel component.
 *
 * Upstream deps: lucide-react icons, ToolId domain type, editor actions.
 *
 * Downstream consumers: App shell.
 *
 * Failure modes: seat assistant remains disabled until an assistant helper
 *                exists; import and auto-seat failures are surfaced by App.
 *
 * Performance: standard React render cost.
 */

import {
  Armchair,
  Bot,
  Circle,
  DoorOpen,
  Grid2X2,
  Landmark,
  ListChecks,
  MousePointer2,
  Music2,
  RectangleHorizontal,
  Sofa,
  Sparkles,
  Square,
  Table2,
  Type,
  Upload,
  UserRoundCheck,
  UsersRound,
  Utensils,
  Wine,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getSeatStats } from '../domain/scene'
import type { ToolId } from '../domain/types'
import type { EditorAction, EditorState } from '../state/editorState'

interface PalettePanelProps {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  onImportGuests: () => void
  onAutoSeat: () => void
}

const objectTools: Array<{ id: ToolId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'tableRound', label: 'Table', icon: Circle },
  { id: 'tableSquare', label: 'Square Table', icon: Square },
  { id: 'tableRect', label: 'Rect. Table', icon: RectangleHorizontal },
  { id: 'chair', label: 'Chair', icon: Armchair },
  { id: 'sofa', label: 'Sofa/Lounge', icon: Sofa },
  { id: 'bar', label: 'Bar', icon: Wine },
  { id: 'buffet', label: 'Buffet', icon: Utensils },
  { id: 'stage', label: 'Stage', icon: Landmark },
  { id: 'danceFloor', label: 'Dance Floor', icon: Music2 },
  { id: 'decor', label: 'Decor/Object', icon: Sparkles },
  { id: 'wall', label: 'Wall/Room', icon: Grid2X2 },
  { id: 'door', label: 'Door', icon: DoorOpen },
  { id: 'label', label: 'Text Label', icon: Type },
]

export function PalettePanel({ state, dispatch, onImportGuests, onAutoSeat }: PalettePanelProps) {
  const { t } = useTranslation()
  const stats = getSeatStats(state.scene)

  return (
    <aside className="panel palette-panel" aria-label={t('labels.editorTools')} role="toolbar">
      <section className="tool-section">
        <h2>{t('labels.objects')}</h2>
        <div className="tool-grid">
          {objectTools.map((tool) => {
            const Icon = tool.icon
            const isActive = state.activeTool === tool.id

            return (
              <button
                key={tool.id}
                type="button"
                className={isActive ? 'tool-button is-active' : 'tool-button'}
                onClick={() => dispatch({ type: 'selectTool', tool: tool.id })}
                aria-pressed={isActive}
                title={tool.label}
              >
                <Icon size={18} />
                <span>{tool.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="tool-section">
        <h2>{t('labels.guestsSeating')}</h2>
        <div className="stacked-tools">
          <button type="button" className="row-tool" onClick={() => dispatch({ type: 'setView', view: 'guestList' })}>
            <UsersRound aria-hidden="true" size={17} />
            {t('actions.guestList')}
          </button>
          <button type="button" className="row-tool" onClick={onImportGuests}>
            <Upload aria-hidden="true" size={17} />
            {t('actions.importGuests')}
          </button>
          <button type="button" className="row-tool" onClick={onAutoSeat}>
            <UserRoundCheck aria-hidden="true" size={17} />
            {t('actions.autoSeat')}
          </button>
          <button type="button" className="row-tool" disabled title="Seat assistant is owned by another slice">
            <Bot aria-hidden="true" size={17} />
            {t('actions.seatAssistant')}
          </button>
        </div>
        <div className="metric-row">
          <span>{t('labels.unassigned')}</span>
          <strong>{stats.unassigned}</strong>
        </div>
      </section>

      <section className="tool-section">
        <h2>{t('labels.views')}</h2>
        <div className="segmented vertical">
          <button
            type="button"
            className={(state.scene.view?.activeView ?? 'floorplan') === 'floorplan' ? 'is-active' : ''}
            onClick={() => dispatch({ type: 'setView', view: 'floorplan' })}
          >
            <Table2 aria-hidden="true" size={16} />
            {t('labels.floorplan')}
          </button>
          <button
            type="button"
            className={state.scene.view?.activeView === 'guestList' ? 'is-active' : ''}
            onClick={() => dispatch({ type: 'setView', view: 'guestList' })}
          >
            <ListChecks aria-hidden="true" size={16} />
            {t('labels.guestListView')}
          </button>
        </div>
      </section>
    </aside>
  )
}
