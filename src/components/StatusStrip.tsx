/**
 * Purpose: Shows dense scene health and display toggles along the bottom edge
 *          of the editor.
 *
 * Public API: StatusStrip component.
 *
 * Upstream deps: scene seat stats, editor actions, react-i18next labels.
 *
 * Downstream consumers: App shell.
 *
 * Failure modes: help is a visible placeholder for a later slice; label toggle
 *                is fully local.
 *
 * Performance: standard.
 */

import { CircleHelp, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getSeatStats } from '../domain/scene'
import type { EditorAction, EditorState } from '../state/editorState'

interface StatusStripProps {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}

export function StatusStrip({ state, dispatch }: StatusStripProps) {
  const { t } = useTranslation()
  const stats = getSeatStats(state.scene)

  return (
    <footer className="status-strip" aria-label="Editor status">
      <span>
        {t('labels.guests')}: {stats.guests}
      </span>
      <span>
        {t('labels.seated')}: {stats.seated}
      </span>
      <span>
        {t('labels.unassigned')}: {stats.unassigned}
      </span>
      <span>
        {t('labels.balance')}: {stats.balance}
      </span>
      <span>
        {t('labels.grid')}: {state.scene.canvas.gridSize}px
      </span>
      {state.autoSeatingConflicts.length > 0 ? <span>Conflicts: {state.autoSeatingConflicts.length}</span> : null}
      <button
        type="button"
        className={(state.scene.view?.showLabels ?? true) ? 'status-toggle is-active' : 'status-toggle'}
        onClick={() => dispatch({ type: 'toggleLabels' })}
      >
        <Tags aria-hidden="true" size={14} />
        {t('labels.showLabels')}
      </button>
      <button type="button" className="status-toggle" disabled title="Help content is owned by a later slice">
        <CircleHelp aria-hidden="true" size={14} />
        Help
      </button>
    </footer>
  )
}
