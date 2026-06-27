/**
 * Purpose: Creates and mutates Wedding Seat Map scenes with immutable helpers
 *          that keep table seats and local guest assignments consistent.
 *
 * Public API: createDefaultScene, createObjectForTool, updateObject,
 *             assignGuestToSeat, getGuestName, getTables, getSeatStats.
 *
 * Upstream deps: chair layout normalization, ID helpers, domain types.
 *
 * Downstream consumers: App editor, canvas, inspector, local editor state,
 *                       chair/domain tests.
 *
 * Failure modes: unknown object IDs are ignored; helpers return a new scene and
 *                never mutate caller-owned objects.
 *
 * Performance: O(objects + guests) per mutation; suitable for editor scale.
 */

import { normalizeTableSeats } from './chairLayout'
import { makeId, nowIso } from './ids'
import type {
  AreaObject,
  Guest,
  GuestAssignment,
  LabelObject,
  LinearObject,
  LocaleCode,
  Scene,
  SceneObject,
  TableObject,
  ToolId,
  ViewSettings,
} from './types'

export function createDefaultScene(locale = 'en'): Scene {
  const mainTable = createTableObject('rectangular', 430, 240, '1', {
    tableName: 'Main Table',
    width: 220,
    height: 102,
    chairMode: 'manual',
    perSide: { top: 4, right: 1, bottom: 4, left: 1 },
    mainTable: true,
    stroke: '#0f766e',
    fill: '#fffdf7',
  })
  const familyTable = createTableObject('round', 205, 265, '2', { tableName: 'Family' })
  const friendsTable = createTableObject('square', 740, 270, '3', { tableName: 'Friends' })
  const kidsTable = createTableObject('round', 745, 525, '4', { tableName: 'Kids', fill: '#fff7ed', stroke: '#d99b20' })
  const guests = createStarterGuests()

  const seededTables = [
    seatGuests(mainTable, guests.slice(0, 6)),
    seatGuests(familyTable, guests.slice(6, 11)),
    seatGuests(friendsTable, guests.slice(11, 15)),
    kidsTable,
  ]

  return {
    schemaVersion: 1,
    id: makeId('scene'),
    name: 'Reception floorplan',
    updatedAt: nowIso(),
    locale: normalizeLocale(locale),
    canvas: {
      width: 1100,
      height: 760,
      gridSize: 24,
      showGrid: true,
      snapToGrid: true,
    },
    view: {
      showLabels: true,
      activeView: 'floorplan',
    },
    groups: [
      { id: 'group_family', name: 'Family', color: '#0f766e' },
      { id: 'group_friends', name: 'Friends', color: '#be123c' },
      { id: 'group_vips', name: 'VIP', color: '#d99b20' },
    ],
    guests,
    incompatiblePairs: [],
    objects: [
      createBoundaryWall(70, 78, 960, 78, 'North wall'),
      createBoundaryWall(70, 690, 960, 690, 'South wall'),
      createBoundaryWall(70, 78, 70, 690, 'West wall'),
      createBoundaryWall(1030, 78, 1030, 690, 'East wall'),
      createDoor(510, 690, 625, 690),
      createAreaObject('stage', 412, 104),
      createAreaObject('buffet', 120, 112),
      createAreaObject('bar', 840, 114),
      createAreaObject('danceFloor', 405, 450),
      createAreaObject('sofa', 118, 548),
      createAreaObject('decor', 915, 565),
      createLabelObject(448, 95, 'Ceremony wall'),
      ...seededTables,
    ],
  }
}

export function createTableObject(
  shape: TableObject['shape'],
  x: number,
  y: number,
  tableNumber: string,
  overrides: Partial<TableObject> = {},
): TableObject {
  const id = overrides.id ?? makeId('table')
  const base: TableObject = {
    id,
    type: 'table',
    x,
    y,
    width: shape === 'rectangular' ? 180 : 118,
    height: shape === 'rectangular' ? 96 : 118,
    rotation: 0,
    label: `Table ${tableNumber}`,
    fill: '#ffffff',
    stroke: '#0f766e',
    shape,
    tableNumber,
    tableName: '',
    chairMode: 'auto',
    seatCount: shape === 'rectangular' ? 10 : 8,
    perSide:
      shape === 'rectangular'
        ? { top: 3, right: 2, bottom: 3, left: 2 }
        : { top: 2, right: 2, bottom: 2, left: 2 },
    seats: [],
    ...overrides,
  }

  return normalizeTableSeats(base)
}

export function createObjectForTool(tool: Exclude<ToolId, 'select'>, x: number, y: number, nextTableNumber: string): SceneObject {
  if (tool === 'tableRound') return createTableObject('round', x, y, nextTableNumber)
  if (tool === 'tableSquare') return createTableObject('square', x, y, nextTableNumber)
  if (tool === 'tableRect') return createTableObject('rectangular', x, y, nextTableNumber)
  if (tool === 'wall') return createBoundaryWall(x, y, x + 160, y, 'Wall')
  if (tool === 'door') return createDoor(x, y, x + 88, y)
  if (tool === 'label') return createLabelObject(x, y, 'Text label')

  return createAreaObject(tool, x, y)
}

export function updateObject(scene: Scene, objectId: string, patch: Partial<SceneObject>): Scene {
  return touchScene({
    ...scene,
    objects: scene.objects.map((object) => {
      if (object.id !== objectId) return object
      const next = { ...object, ...patch } as SceneObject
      return next.type === 'table' ? normalizeTableSeats(next) : next
    }),
  })
}

export function assignGuestToSeat(scene: Scene, tableId: string, seatId: string, guestId?: string): Scene {
  return touchScene({
    ...scene,
    objects: scene.objects.map((object) => {
      if (object.type !== 'table') return object

      return {
        ...object,
        seats: object.seats.map((seat) => ({
          ...seat,
          guestId:
            object.id === tableId && seat.id === seatId
              ? guestId
              : seat.guestId === guestId
                ? undefined
                : seat.guestId,
        })),
      }
    }),
  })
}

export function applyAssignments(scene: Scene, assignments: GuestAssignment[]): Scene {
  const assignmentBySeat = new Map(
    assignments.map((assignment) => [`${assignment.tableId}:${assignment.seatId}`, assignment.guestId]),
  )

  return touchScene({
    ...scene,
    objects: scene.objects.map((object) => {
      if (object.type !== 'table') return object

      return {
        ...object,
        seats: object.seats.map((seat) => ({
          ...seat,
          guestId: assignmentBySeat.get(`${object.id}:${seat.id}`) ?? seat.guestId,
        })),
      }
    }),
  })
}

export function getTables(scene: Scene): TableObject[] {
  return scene.objects.filter((object): object is TableObject => object.type === 'table')
}

export function getGuestName(scene: Scene, guestId?: string): string {
  if (!guestId) return ''
  return scene.guests.find((guest) => guest.id === guestId)?.name ?? ''
}

export function getSeatStats(scene: Scene): { guests: number; seated: number; unassigned: number; balance: number } {
  const seatedIds = new Set(
    getTables(scene).flatMap((table) => table.seats.map((seat) => seat.guestId).filter(Boolean) as string[]),
  )
  const unassigned = scene.guests.filter((guest) => !seatedIds.has(guest.id)).length
  const tableLoads = getTables(scene).map((table) => table.seats.filter((seat) => seat.guestId).length)
  const max = Math.max(...tableLoads, 0)
  const min = Math.min(...tableLoads, 0)

  return {
    guests: scene.guests.length,
    seated: seatedIds.size,
    unassigned,
    balance: max - min,
  }
}

export function updateSceneName(scene: Scene, name: string): Scene {
  return touchScene({ ...scene, name })
}

export function updateLocale(scene: Scene, locale: LocaleCode): Scene {
  return touchScene({ ...scene, locale })
}

export function updateCanvas(scene: Scene, patch: Partial<Scene['canvas']>): Scene {
  return touchScene({ ...scene, canvas: { ...scene.canvas, ...patch } })
}

export function updateView(scene: Scene, patch: Partial<Scene['view']>): Scene {
  const current: ViewSettings = scene.view ?? { showLabels: true, activeView: 'floorplan' }

  return touchScene({ ...scene, view: { ...current, ...patch } })
}

export function touchScene(scene: Scene): Scene {
  return { ...scene, updatedAt: nowIso() }
}

function createStarterGuests(): Guest[] {
  return [
    ['guest_ana', 'Ana Silva', 'group_vips'],
    ['guest_joao', 'Joao Silva', 'group_vips'],
    ['guest_maria', 'Maria Costa', 'group_vips'],
    ['guest_pedro', 'Pedro Costa', 'group_vips'],
    ['guest_lucia', 'Lucia Alves', 'group_vips'],
    ['guest_rafael', 'Rafael Alves', 'group_vips'],
    ['guest_sofia', 'Sofia Lima', 'group_family'],
    ['guest_tiago', 'Tiago Lima', 'group_family'],
    ['guest_clara', 'Clara Rocha', 'group_family'],
    ['guest_miguel', 'Miguel Rocha', 'group_family'],
    ['guest_elena', 'Elena Dias', 'group_family'],
    ['guest_luis', 'Luis Perez', 'group_friends'],
    ['guest_carla', 'Carla Perez', 'group_friends'],
    ['guest_ines', 'Ines Ramos', 'group_friends'],
    ['guest_bruno', 'Bruno Ramos', 'group_friends'],
    ['guest_lia', 'Lia', 'group_family'],
    ['guest_noah', 'Noah', 'group_family'],
  ].map(([id, name, groupId]) => ({
    id,
    name,
    groupId,
    groupName: groupId === 'group_vips' ? 'VIP' : groupId === 'group_family' ? 'Family' : 'Friends',
  }))
}

function seatGuests(table: TableObject, guests: Guest[]): TableObject {
  return {
    ...table,
    seats: table.seats.map((seat, index) => ({
      ...seat,
      guestId: guests[index]?.id,
    })),
  }
}

function createBoundaryWall(x: number, y: number, x2: number, y2: number, label: string): LinearObject {
  return {
    id: makeId('wall'),
    type: 'wall',
    x,
    y,
    x2,
    y2,
    width: Math.abs(x2 - x) || 8,
    height: Math.abs(y2 - y) || 8,
    rotation: 0,
    label,
    stroke: '#334155',
  }
}

function createDoor(x: number, y: number, x2: number, y2: number): LinearObject {
  return {
    id: makeId('door'),
    type: 'door',
    x,
    y,
    x2,
    y2,
    width: Math.abs(x2 - x) || 88,
    height: 10,
    rotation: 0,
    label: 'Door',
    stroke: '#b45309',
  }
}

function createLabelObject(x: number, y: number, text: string): LabelObject {
  return {
    id: makeId('label'),
    type: 'label',
    x,
    y,
    width: 160,
    height: 38,
    rotation: 0,
    label: text,
    text,
    fontSize: 18,
    fill: '#111827',
  }
}

function createAreaObject(type: Exclude<ToolId, 'select' | 'tableRound' | 'tableSquare' | 'tableRect' | 'wall' | 'door' | 'label'>, x: number, y: number): AreaObject {
  const defaults: Record<typeof type, Pick<AreaObject, 'width' | 'height' | 'label' | 'fill' | 'stroke'>> = {
    chair: { width: 46, height: 46, label: 'Chair', fill: '#f8fafc', stroke: '#64748b' },
    sofa: { width: 148, height: 64, label: 'Lounge', fill: '#f1f5f9', stroke: '#64748b' },
    buffet: { width: 170, height: 64, label: 'Buffet', fill: '#fef3c7', stroke: '#d99b20' },
    bar: { width: 150, height: 62, label: 'Bar', fill: '#fdf2f8', stroke: '#be123c' },
    stage: { width: 280, height: 74, label: 'Stage', fill: '#f7d783', stroke: '#d99b20' },
    danceFloor: { width: 290, height: 150, label: 'Dance floor', fill: '#ecfeff', stroke: '#0f766e' },
    freeArea: { width: 170, height: 110, label: 'Free area', fill: '#f8fafc', stroke: '#94a3b8' },
    decor: { width: 74, height: 74, label: 'Decor', fill: '#ffe4e6', stroke: '#be123c' },
  }
  const shape = defaults[type]

  return {
    id: makeId(type),
    type,
    x,
    y,
    width: shape.width,
    height: shape.height,
    rotation: 0,
    label: shape.label,
    fill: shape.fill,
    stroke: shape.stroke,
  }
}

function normalizeLocale(locale: string): LocaleCode {
  if (locale === 'pt-BR' || locale.toLowerCase().startsWith('pt')) return 'pt-BR'
  if (locale === 'es' || locale.toLowerCase().startsWith('es')) return 'es'
  return 'en'
}
