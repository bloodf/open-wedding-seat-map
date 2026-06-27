/**
 * Purpose: Owns local editor state transitions for scene editing without tying
 *          the domain model to React components.
 *
 * Public API: createInitialEditorState(), createEditorStateFromScene(),
 *             editorReducer(), selectedObject().
 *
 * Upstream deps: scene construction and immutable mutation helpers.
 *
 * Downstream consumers: App shell, canvas, palette, inspector, import/export
 *                       integration, persistence bootstrap, domain tests.
 *
 * Failure modes: invalid object IDs are ignored by domain helpers; guest text
 *                parsing produces stable local guest IDs scoped to the table;
 *                imported scene data must already be schema-validated.
 *
 * Performance: O(scene objects + table seats) per reducer action.
 */

import {
  applyAssignments,
  createDefaultScene,
  createObjectForTool,
  getTables,
  touchScene,
  updateCanvas,
  updateLocale,
  updateObject,
  updateSceneName,
  updateView,
} from '../domain/scene'
import type {
  AutoSeatConflict,
  BackgroundSvgObject,
  Guest,
  GuestAssignment,
  GuestGroup,
  LocaleCode,
  Scene,
  SceneObject,
  TableObject,
  ToolId,
  ViewSettings,
} from '../domain/types'

export interface EditorState {
  scene: Scene
  selectedObjectId?: string
  activeTool: ToolId
  viewport: {
    zoom: number
  }
  statusMessage: string
  shareUrl?: string
  autoSeatingConflicts: AutoSeatConflict[]
}

export type EditorAction =
  | { type: 'replaceScene'; scene: Scene; statusMessage?: string }
  | {
      type: 'mergeGuestImport'
      guests: Guest[]
      groups: GuestGroup[]
      assignments?: GuestAssignment[]
      statusMessage?: string
    }
  | { type: 'addBackgroundSvg'; background: BackgroundSvgObject; statusMessage?: string }
  | { type: 'applyAutoSeating'; scene: Scene; conflicts: AutoSeatConflict[]; statusMessage?: string }
  | { type: 'setStatus'; statusMessage: string }
  | { type: 'setShareUrl'; shareUrl: string; statusMessage?: string }
  | { type: 'selectTool'; tool: ToolId }
  | { type: 'selectObject'; objectId?: string }
  | { type: 'createObject'; x: number; y: number }
  | { type: 'updateObject'; objectId: string; patch: Partial<SceneObject> }
  | { type: 'updateTableGuests'; tableId: string; text: string }
  | { type: 'setSceneName'; name: string }
  | { type: 'setLocale'; locale: LocaleCode }
  | { type: 'toggleGrid' }
  | { type: 'toggleSnap' }
  | { type: 'toggleLabels' }
  | { type: 'setView'; view: ViewSettings['activeView'] }
  | { type: 'setGridSize'; gridSize: number }
  | { type: 'setZoom'; zoom: number }
  | { type: 'resetScene' }

export function createInitialEditorState(locale = 'en'): EditorState {
  return createEditorStateFromScene(createDefaultScene(locale))
}

export function createEditorStateFromScene(scene: Scene): EditorState {
  return {
    scene,
    selectedObjectId: getInitialSelection(scene),
    activeTool: 'select',
    viewport: {
      zoom: 1,
    },
    statusMessage: 'Local draft',
    autoSeatingConflicts: [],
  }
}

export function selectedObject(state: EditorState): SceneObject | undefined {
  return state.scene.objects.find((object) => object.id === state.selectedObjectId)
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === 'replaceScene') {
    return {
      ...createEditorStateFromScene(action.scene),
      statusMessage: action.statusMessage ?? state.statusMessage,
    }
  }

  if (action.type === 'mergeGuestImport') {
    const sceneWithGuests = touchScene({
      ...state.scene,
      guests: mergeById(state.scene.guests, action.guests),
      groups: mergeById(state.scene.groups, action.groups),
    })

    return {
      ...state,
      scene: action.assignments?.length ? applyAssignments(sceneWithGuests, action.assignments) : sceneWithGuests,
      statusMessage: action.statusMessage ?? state.statusMessage,
      autoSeatingConflicts: [],
    }
  }

  if (action.type === 'addBackgroundSvg') {
    return {
      ...state,
      scene: touchScene({
        ...state.scene,
        objects: [...state.scene.objects, action.background],
      }),
      selectedObjectId: action.background.id,
      statusMessage: action.statusMessage ?? state.statusMessage,
      autoSeatingConflicts: [],
    }
  }

  if (action.type === 'applyAutoSeating') {
    return {
      ...state,
      scene: action.scene,
      selectedObjectId: getInitialSelection(action.scene),
      statusMessage: action.statusMessage ?? state.statusMessage,
      autoSeatingConflicts: action.conflicts,
    }
  }

  if (action.type === 'setStatus') {
    return {
      ...state,
      statusMessage: action.statusMessage,
    }
  }

  if (action.type === 'setShareUrl') {
    return {
      ...state,
      shareUrl: action.shareUrl,
      statusMessage: action.statusMessage ?? state.statusMessage,
    }
  }

  if (action.type === 'selectTool') {
    return { ...state, activeTool: action.tool }
  }

  if (action.type === 'selectObject') {
    return { ...state, selectedObjectId: action.objectId, activeTool: 'select' }
  }

  if (action.type === 'createObject') {
    if (state.activeTool === 'select') return state

    const nextTableNumber = `${getTables(state.scene).length + 1}`
    const x = state.scene.canvas.snapToGrid ? snap(action.x, state.scene.canvas.gridSize) : action.x
    const y = state.scene.canvas.snapToGrid ? snap(action.y, state.scene.canvas.gridSize) : action.y
    const object = createObjectForTool(state.activeTool, x, y, nextTableNumber)

    return {
      ...state,
      scene: {
        ...state.scene,
        updatedAt: new Date().toISOString(),
        objects: [...state.scene.objects, object],
      },
      selectedObjectId: object.id,
      activeTool: 'select',
    }
  }

  if (action.type === 'updateObject') {
    return {
      ...state,
      scene: updateObject(state.scene, action.objectId, action.patch),
    }
  }

  if (action.type === 'updateTableGuests') {
    const table = state.scene.objects.find(
      (object): object is TableObject => object.id === action.tableId && object.type === 'table',
    )
    if (!table) return state

    const names = action.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, table.seats.length)
    const tableGuestIds = new Set(table.seats.map((seat) => seat.guestId).filter(Boolean))
    const otherGuests = state.scene.guests.filter((guest) => !tableGuestIds.has(guest.id))
    const guests: Guest[] = names.map((name, index) => ({
      id: `${table.id}_guest_${index + 1}`,
      name,
    }))

    return {
      ...state,
      scene: {
        ...state.scene,
        updatedAt: new Date().toISOString(),
        guests: [...otherGuests, ...guests],
        objects: state.scene.objects.map((object) => {
          if (object.id !== table.id || object.type !== 'table') return object

          return {
            ...object,
            seats: object.seats.map((seat, index) => ({
              ...seat,
              guestId: guests[index]?.id,
            })),
          }
        }),
      },
    }
  }

  if (action.type === 'setSceneName') {
    return {
      ...state,
      scene: updateSceneName(state.scene, action.name),
    }
  }

  if (action.type === 'setLocale') {
    return {
      ...state,
      scene: updateLocale(state.scene, action.locale),
    }
  }

  if (action.type === 'toggleGrid') {
    return {
      ...state,
      scene: updateCanvas(state.scene, { showGrid: !state.scene.canvas.showGrid }),
    }
  }

  if (action.type === 'toggleSnap') {
    return {
      ...state,
    scene: updateCanvas(state.scene, { snapToGrid: !(state.scene.canvas.snapToGrid ?? false) }),
    }
  }

  if (action.type === 'toggleLabels') {
    return {
      ...state,
    scene: updateView(state.scene, { showLabels: !(state.scene.view?.showLabels ?? true) }),
    }
  }

  if (action.type === 'setView') {
    return {
      ...state,
      scene: updateView(state.scene, { activeView: action.view }),
    }
  }

  if (action.type === 'setGridSize') {
    return {
      ...state,
      scene: updateCanvas(state.scene, { gridSize: Math.min(64, Math.max(8, Math.round(action.gridSize))) }),
    }
  }

  if (action.type === 'setZoom') {
    return {
      ...state,
      viewport: {
        zoom: Math.min(1.5, Math.max(0.55, action.zoom)),
      },
    }
  }

  if (action.type === 'resetScene') {
    return createInitialEditorState(state.scene.locale)
  }

  return state
}

function snap(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

function getInitialSelection(scene: Scene): string | undefined {
  return getTables(scene)[0]?.id ?? scene.objects[0]?.id
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const incomingById = new Map(incoming.map((item) => [item.id, item]))
  const merged = current.map((item) => incomingById.get(item.id) ?? item)
  const currentIds = new Set(current.map((item) => item.id))
  return [...merged, ...incoming.filter((item) => !currentIds.has(item.id))]
}
