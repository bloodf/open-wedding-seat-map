/**
 * Purpose: Renders the interactive SVG floorplan canvas, lightweight guest-list
 *          view, and canvas-level controls.
 *
 * Public API: Canvas component.
 *
 * Upstream deps: chair layout calculations, scene domain helpers, SVG rendering,
 *                react-i18next labels.
 *
 * Downstream consumers: App shell and browser smoke checks.
 *
 * Failure modes: pointer coordinates outside the SVG are ignored by the browser;
 *                unsupported scene objects fall back to area rendering.
 *
 * Performance: O(objects + seats + guests) per render.
 */

import { Expand, Grid3X3, Layers3, Minus, Move, Plus, Ruler } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculateChairPositions } from '../domain/chairLayout'
import { getGuestName, getSeatStats, getTables } from '../domain/scene'
import type { AreaObject, BackgroundSvgObject, LabelObject, LinearObject, SceneObject, TableObject } from '../domain/types'
import type { EditorAction, EditorState } from '../state/editorState'

interface CanvasProps {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}

export function Canvas({ state, dispatch }: CanvasProps) {
  if ((state.scene.view?.activeView ?? 'floorplan') === 'guestList') {
    return <GuestListView state={state} />
  }

  const { scene } = state

  function handleCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget && state.activeTool === 'select') return

    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = scene.canvas.width / rect.width
    const scaleY = scene.canvas.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    dispatch({ type: 'createObject', x: Math.round(x), y: Math.round(y) })
  }

  return (
    <main className="canvas-wrap" aria-label="Wedding seat map editor">
      <CanvasToolbar state={state} dispatch={dispatch} />
      <svg
        className="canvas"
        data-testid="seat-map-canvas"
        viewBox={`0 0 ${scene.canvas.width} ${scene.canvas.height}`}
        role="img"
        aria-label="Wedding seating map"
        onClick={handleCanvasClick}
        style={{ transform: `scale(${state.viewport.zoom})`, transformOrigin: 'top left' }}
      >
        <defs>
          <pattern id="grid" width={scene.canvas.gridSize} height={scene.canvas.gridSize} patternUnits="userSpaceOnUse">
            <path
              d={`M ${scene.canvas.gridSize} 0 L 0 0 0 ${scene.canvas.gridSize}`}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={scene.canvas.width} height={scene.canvas.height} fill="#ffffff" />
        {scene.canvas.showGrid ? <rect width={scene.canvas.width} height={scene.canvas.height} fill="url(#grid)" /> : null}
        {scene.objects.map((object) => (
          <ObjectLayer
            key={object.id}
            object={object}
            selected={object.id === state.selectedObjectId}
            state={state}
            dispatch={dispatch}
          />
        ))}
      </svg>
    </main>
  )
}

function CanvasToolbar({ state, dispatch }: { state: EditorState; dispatch: React.Dispatch<EditorAction> }) {
  const { t } = useTranslation()

  return (
    <div className="canvas-toolbar" aria-label="Canvas controls">
      <div className="canvas-toolbar__left">
        <button type="button" className={state.scene.canvas.showGrid ? 'chip is-active' : 'chip'} onClick={() => dispatch({ type: 'toggleGrid' })}>
          <Grid3X3 aria-hidden="true" size={15} />
          {t('labels.grid')}
        </button>
        <button type="button" className={state.scene.canvas.snapToGrid ? 'chip is-active' : 'chip'} onClick={() => dispatch({ type: 'toggleSnap' })}>
          <Move aria-hidden="true" size={15} />
          Snap
        </button>
        <label className="spacing-control">
          <Ruler aria-hidden="true" size={15} />
          <input
            type="number"
            min="8"
            max="64"
            value={state.scene.canvas.gridSize}
            onChange={(event) => dispatch({ type: 'setGridSize', gridSize: Number(event.target.value) })}
            aria-label="Grid spacing"
          />
        </label>
      </div>
      <div className="canvas-toolbar__right">
        <button type="button" className="icon-button" onClick={() => dispatch({ type: 'setZoom', zoom: state.viewport.zoom - 0.1 })} title="Zoom out">
          <Minus aria-hidden="true" size={16} />
        </button>
        <span className="zoom-label">{Math.round(state.viewport.zoom * 100)}%</span>
        <button type="button" className="icon-button" onClick={() => dispatch({ type: 'setZoom', zoom: state.viewport.zoom + 0.1 })} title="Zoom in">
          <Plus aria-hidden="true" size={16} />
        </button>
        <button type="button" className="icon-button" disabled title="Layer manager is owned by a later slice">
          <Layers3 aria-hidden="true" size={16} />
        </button>
        <button type="button" className="icon-button" disabled title="Fullscreen is owned by a later slice">
          <Expand aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  )
}

function ObjectLayer({
  object,
  selected,
  state,
  dispatch,
}: {
  object: SceneObject
  selected: boolean
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}) {
  const commonProps = {
    onClick: (event: React.MouseEvent<SVGGElement>) => {
      event.stopPropagation()
      dispatch({ type: 'selectObject', objectId: object.id })
    },
    className: selected ? 'scene-object is-selected' : 'scene-object',
  }

  if (object.type === 'table') {
    return <TableLayer object={object} selected={selected} state={state} commonProps={commonProps} />
  }

  if (object.type === 'label') {
    return <LabelLayer object={object} state={state} commonProps={commonProps} />
  }

  if (object.type === 'wall' || object.type === 'line' || object.type === 'door') {
    return <LinearLayer object={object} state={state} commonProps={commonProps} />
  }

  if (object.type === 'backgroundSvg') {
    return <BackgroundSvgLayer object={object} commonProps={commonProps} />
  }

  return <AreaLayer object={object as AreaObject} state={state} commonProps={commonProps} />
}

function TableLayer({
  object,
  selected,
  state,
  commonProps,
}: {
  object: TableObject
  selected: boolean
  state: EditorState
  commonProps: React.SVGProps<SVGGElement>
}) {
  const centerX = object.x + object.width / 2
  const centerY = object.y + object.height / 2
  const chairs = calculateChairPositions(object)
  const label = object.tableName || `Table ${object.tableNumber}`

  return (
    <g {...commonProps} data-testid={`seat-map-object-table-${object.id}`}>
      {chairs.map((chair) => (
        <g key={chair.seatId}>
          <circle cx={chair.x} cy={chair.y} r="13" fill="#f8fafc" stroke="#64748b" strokeWidth="1.4" />
          {(state.scene.view?.showLabels ?? true) ? (
            <text x={chair.x} y={chair.y + 3} textAnchor="middle" className="chair-label">
              {getGuestName(state.scene, chair.guestId) || chair.label}
            </text>
          ) : null}
        </g>
      ))}
      {object.shape === 'round' ? (
        <circle
          cx={centerX}
          cy={centerY}
          r={Math.min(object.width, object.height) / 2}
          fill={object.fill}
          stroke={selected ? '#0f766e' : object.stroke}
          strokeWidth={selected ? 3 : 2}
        />
      ) : (
        <rect
          x={object.x}
          y={object.y}
          width={object.width}
          height={object.height}
          rx={object.shape === 'square' ? 6 : 4}
          fill={object.fill}
          stroke={selected ? '#0f766e' : object.stroke}
          strokeWidth={selected ? 3 : 2}
        />
      )}
      {(state.scene.view?.showLabels ?? true) ? (
        <>
          <text x={centerX} y={centerY - 4} textAnchor="middle" className="table-title">
            {label}
          </text>
          <text x={centerX} y={centerY + 17} textAnchor="middle" className="table-meta">
            {object.seats.length} seats
          </text>
        </>
      ) : null}
      {selected ? <ResizeHandles object={object} /> : null}
    </g>
  )
}

function BackgroundSvgLayer({
  object,
  commonProps,
}: {
  object: BackgroundSvgObject
  commonProps: React.SVGProps<SVGGElement>
}) {
  return (
    <g {...commonProps}>
      <image
        href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(object.svg)}`}
        x={object.x}
        y={object.y}
        width={object.width}
        height={object.height}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  )
}

function ResizeHandles({ object }: { object: TableObject }) {
  const points = [
    [object.x, object.y],
    [object.x + object.width, object.y],
    [object.x + object.width, object.y + object.height],
    [object.x, object.y + object.height],
  ]

  return (
    <>
      {points.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 4} y={y - 4} width="8" height="8" fill="#ffffff" stroke="#0f766e" strokeWidth="1.5" />
      ))}
    </>
  )
}

function AreaLayer({
  object,
  state,
  commonProps,
}: {
  object: AreaObject
  state: EditorState
  commonProps: React.SVGProps<SVGGElement>
}) {
  const isRound = object.type === 'chair' || object.type === 'decor'

  return (
    <g {...commonProps}>
      {isRound ? (
        <ellipse
          cx={object.x + object.width / 2}
          cy={object.y + object.height / 2}
          rx={object.width / 2}
          ry={object.height / 2}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth="2"
        />
      ) : (
        <rect x={object.x} y={object.y} width={object.width} height={object.height} rx="6" fill={object.fill} stroke={object.stroke} strokeWidth="2" />
      )}
      {(state.scene.view?.showLabels ?? true) ? (
        <text x={object.x + object.width / 2} y={object.y + object.height / 2 + 4} textAnchor="middle" className="area-label">
          {object.label}
        </text>
      ) : null}
    </g>
  )
}

function LabelLayer({
  object,
  state,
  commonProps,
}: {
  object: LabelObject
  state: EditorState
  commonProps: React.SVGProps<SVGGElement>
}) {
  if (!(state.scene.view?.showLabels ?? true)) return <g {...commonProps} />

  return (
    <g {...commonProps}>
      <text x={object.x} y={object.y} fontSize={object.fontSize} fill={object.fill ?? '#111827'} className="free-label">
        {object.text}
      </text>
    </g>
  )
}

function LinearLayer({
  object,
  state,
  commonProps,
}: {
  object: LinearObject
  state: EditorState
  commonProps: React.SVGProps<SVGGElement>
}) {
  return (
    <g {...commonProps}>
      <line
        x1={object.x}
        y1={object.y}
        x2={object.x2}
        y2={object.y2}
        stroke={object.stroke ?? '#475569'}
        strokeWidth={object.type === 'door' ? 10 : 6}
        strokeLinecap="round"
      />
      {(state.scene.view?.showLabels ?? true) && object.type === 'door' ? (
        <text x={(object.x + object.x2) / 2} y={object.y - 10} textAnchor="middle" className="area-label">
          {object.label}
        </text>
      ) : null}
    </g>
  )
}

function GuestListView({ state }: { state: EditorState }) {
  const { t } = useTranslation()
  const tables = getTables(state.scene)
  const seatedIds = new Set(tables.flatMap((table) => table.seats.map((seat) => seat.guestId).filter(Boolean) as string[]))
  const unassignedGuests = state.scene.guests.filter((guest) => !seatedIds.has(guest.id))

  return (
    <main className="canvas-wrap guest-list-view" aria-label="Wedding seat map editor" data-testid="guest-list">
      <div className="canvas-toolbar">
        <span>{t('labels.guestListView')}</span>
        <span>
          {getSeatStats(state.scene).seated} {t('labels.seated').toLowerCase()}
        </span>
      </div>
      <div className="guest-list-grid">
        {tables.map((table) => (
          <section key={table.id} className="guest-table-block">
            <h2>{table.tableName || `Table ${table.tableNumber}`}</h2>
            <ol>
              {table.seats.map((seat) => (
                <li key={seat.id}>
                  <span>{seat.label}</span>
                  <strong>{getGuestName(state.scene, seat.guestId) || 'Unassigned'}</strong>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {unassignedGuests.length > 0 ? (
          <section className="guest-table-block">
            <h2>{t('labels.unassigned')}</h2>
            <ol>
              {unassignedGuests.map((guest) => (
                <li key={guest.id}>
                  <span>-</span>
                  <strong>{guest.name}</strong>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  )
}
