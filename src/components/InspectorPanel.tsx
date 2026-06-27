/**
 * Purpose: Renders editable properties for the selected scene object, with a
 *          dense table-focused inspector for seating setup.
 *
 * Public API: InspectorPanel component.
 *
 * Upstream deps: domain scene types and editor reducer actions.
 *
 * Downstream consumers: App shell.
 *
 * Failure modes: non-table objects expose shared label, position, size, and
 *                color controls; total-seat edits switch manual tables to
 *                auto mode before normalization; deletion is deferred.
 *
 * Performance: O(table seats) when rendering table guest text.
 */

import { Circle, RectangleHorizontal, Square, Trash2 } from 'lucide-react'
import type { TableObject, TableShape } from '../domain/types'
import type { EditorAction, EditorState } from '../state/editorState'
import { selectedObject } from '../state/editorState'

interface InspectorPanelProps {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
}

export function InspectorPanel({ state, dispatch }: InspectorPanelProps) {
  const object = selectedObject(state)

  return (
    <aside className="panel inspector-panel" aria-label="Inspector">
      <div className="panel-heading">
        <h2>Inspector</h2>
        <span>{object?.type ?? 'none'}</span>
      </div>

      {!object ? <p className="empty-state">Select an object to edit details.</p> : null}

      {object ? (
        <>
          <div className="form-grid">
            <label>
              Label
              <input
                aria-label="Object label"
                value={object.label}
                onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { label: event.target.value } })}
              />
            </label>
            <div className="field-row">
              <label>
                X
                <input
                  aria-label="Object x position"
                  type="number"
                  value={Math.round(object.x)}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { x: Number(event.target.value) } })}
                />
              </label>
              <label>
                Y
                <input
                  aria-label="Object y position"
                  type="number"
                  value={Math.round(object.y)}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { y: Number(event.target.value) } })}
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                W
                <input
                  aria-label="Object width"
                  type="number"
                  value={Math.round(object.width)}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { width: Number(event.target.value) } })}
                />
              </label>
              <label>
                H
                <input
                  aria-label="Object height"
                  type="number"
                  value={Math.round(object.height)}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { height: Number(event.target.value) } })}
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                Fill
                <input
                  aria-label="Object fill color"
                  type="color"
                  value={object.fill ?? '#ffffff'}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { fill: event.target.value } })}
                />
              </label>
              <label>
                Stroke
                <input
                  aria-label="Object stroke color"
                  type="color"
                  value={object.stroke ?? '#0f766e'}
                  onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { stroke: event.target.value } })}
                />
              </label>
            </div>
          </div>

          {object.type === 'table' ? <TableInspector table={object} state={state} dispatch={dispatch} /> : null}

          {object.type === 'label' ? (
            <label className="wide-field">
              Text
                <input
                  aria-label="Label text"
                  value={object.text}
                onChange={(event) => dispatch({ type: 'updateObject', objectId: object.id, patch: { text: event.target.value } })}
              />
            </label>
          ) : null}

          <button type="button" className="danger-button" disabled title="Deletion is handled by a later slice">
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </button>
        </>
      ) : null}
    </aside>
  )
}

function TableInspector({ table, state, dispatch }: { table: TableObject; state: EditorState; dispatch: React.Dispatch<EditorAction> }) {
  const guestText = table.seats
    .map((seat) => (seat.guestId ? state.scene.guests.find((guest) => guest.id === seat.guestId)?.name ?? '' : ''))
    .join('\n')

  return (
    <section className="table-inspector">
      <h3>Selected Table</h3>
      <div className="field-row">
        <label>
          Table #
          <input
            aria-label="Table number"
            value={table.tableNumber}
            onChange={(event) => dispatch({ type: 'updateObject', objectId: table.id, patch: { tableNumber: event.target.value } })}
          />
        </label>
        <label>
          Name
          <input
            aria-label="Table name"
            value={table.tableName}
            onChange={(event) => dispatch({ type: 'updateObject', objectId: table.id, patch: { tableName: event.target.value } })}
            placeholder="Family table"
          />
        </label>
      </div>

      <fieldset className="shape-control">
        <legend>Shape</legend>
        <div className="segmented">
          <ShapeButton shape="round" current={table.shape} dispatch={dispatch} tableId={table.id} />
          <ShapeButton shape="square" current={table.shape} dispatch={dispatch} tableId={table.id} />
          <ShapeButton shape="rectangular" current={table.shape} dispatch={dispatch} tableId={table.id} />
        </div>
      </fieldset>

      <div className="field-row">
        <label>
          Chair mode
          <select
            aria-label="Chair mode"
            value={table.chairMode}
            onChange={(event) =>
              dispatch({
                type: 'updateObject',
                objectId: table.id,
                patch: { chairMode: event.target.value as TableObject['chairMode'] },
              })
            }
          >
            <option value="auto">Auto total</option>
            <option value="manual">Manual sides</option>
          </select>
        </label>
        <label>
          Total seats
          <input
            aria-label="Total seats"
            type="number"
            min="0"
            max="80"
            value={table.seatCount}
            onChange={(event) =>
              dispatch({
                type: 'updateObject',
                objectId: table.id,
                patch: { chairMode: 'auto', seatCount: Number(event.target.value) },
              })
            }
          />
        </label>
      </div>

      <div className="side-editor">
        <div className="side-diagram" aria-hidden="true">
          <span className="side top">{table.perSide.top}</span>
          <span className="side right">{table.perSide.right}</span>
          <span className="side bottom">{table.perSide.bottom}</span>
          <span className="side left">{table.perSide.left}</span>
          <span className="diagram-table" />
        </div>
        <div className="side-counts" aria-label="Manual side chair counts">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side}>
              {side}
                <input
                  aria-label={`${side} side chairs`}
                  type="number"
                min="0"
                max="30"
                value={table.perSide[side]}
                onChange={(event) =>
                  dispatch({
                    type: 'updateObject',
                    objectId: table.id,
                    patch: { perSide: { ...table.perSide, [side]: Number(event.target.value) } },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <label className="wide-field">
        Guest assignment
        <textarea
          aria-label="Guest assignment"
          value={guestText}
          rows={Math.min(8, Math.max(4, table.seats.length))}
          onChange={(event) => dispatch({ type: 'updateTableGuests', tableId: table.id, text: event.target.value })}
          placeholder="One guest per line"
        />
      </label>
    </section>
  )
}

function ShapeButton({
  shape,
  current,
  dispatch,
  tableId,
}: {
  shape: TableShape
  current: TableShape
  dispatch: React.Dispatch<EditorAction>
  tableId: string
}) {
  const Icon = shape === 'round' ? Circle : shape === 'square' ? Square : RectangleHorizontal

  return (
    <button
      type="button"
      className={current === shape ? 'is-active' : ''}
      onClick={() => dispatch({ type: 'updateObject', objectId: tableId, patch: { shape } })}
    >
      <Icon aria-hidden="true" size={15} />
      {shape}
    </button>
  )
}
