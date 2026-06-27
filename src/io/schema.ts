/**
 * Purpose: Validates and canonicalizes Wedding Seat Map scene documents before
 *          import/export code accepts them as editable app data.
 *
 * Public API: WEDDING_SEAT_MAP_SCHEMA_VERSION, WEDDING_SEAT_MAP_MIME,
 *             SceneSchemaError, validateSceneDocument, canonicalizeScene.
 *
 * Upstream deps: domain chair normalization and canonical domain types.
 *
 * Downstream consumers: JSON, CSV, SVG, PDF IO modules and unit tests.
 *
 * Failure modes: throws SceneSchemaError for unsupported schema versions or
 *                malformed required fields. No side effects; safe to retry.
 *
 * Performance: O(objects + seats + guests + rules) per scene.
 */

import { normalizeTableSeats } from '../domain/chairLayout'
import type {
  AreaObject,
  BackgroundSvgObject,
  CanvasSettings,
  Guest,
  GuestGroup,
  IncompatiblePair,
  LabelObject,
  LinearObject,
  ObjectType,
  PerSideCounts,
  Scene,
  SceneObject,
  Seat,
  TableObject,
  ViewSettings,
} from '../domain/types'

export const WEDDING_SEAT_MAP_SCHEMA_VERSION = 1
export const WEDDING_SEAT_MAP_MIME = 'application/vnd.wedding-seat-map+json'

const OBJECT_TYPES: ObjectType[] = [
  'table',
  'label',
  'wall',
  'line',
  'door',
  'buffet',
  'bar',
  'stage',
  'danceFloor',
  'freeArea',
  'chair',
  'sofa',
  'decor',
  'backgroundSvg',
]

export class SceneSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SceneSchemaError'
  }
}

export interface SceneValidationResult {
  scene: Scene
  warnings: string[]
}

export function validateSceneDocument(value: unknown): SceneValidationResult {
  if (!isRecord(value)) {
    throw new SceneSchemaError('Scene document must be a JSON object.')
  }

  if (value.schemaVersion !== WEDDING_SEAT_MAP_SCHEMA_VERSION) {
    throw new SceneSchemaError(`Unsupported schema version: ${String(value.schemaVersion)}.`)
  }

  const warnings: string[] = []

  if (!isSceneLike(value)) {
    throw new SceneSchemaError('Scene document is missing required fields.')
  }

  const scene = canonicalizeScene(value)
  const assignedGuestIds = new Set(scene.guests.map((guest) => guest.id))

  scene.objects.forEach((object) => {
    if (object.type !== 'table') return

    object.seats.forEach((seat) => {
      if (seat.guestId && !assignedGuestIds.has(seat.guestId)) {
        warnings.push(`Seat ${seat.id} references missing guest ${seat.guestId}.`)
      }
    })
  })

  return { scene, warnings }
}

export function canonicalizeScene(scene: Scene): Scene {
  return {
    schemaVersion: WEDDING_SEAT_MAP_SCHEMA_VERSION,
    id: scene.id,
    name: scene.name,
    updatedAt: scene.updatedAt,
    locale: scene.locale,
    canvas: canonicalizeCanvas(scene.canvas),
    view: canonicalizeView(scene.view),
    guests: scene.guests.map(canonicalizeGuest),
    groups: scene.groups.map(canonicalizeGroup),
    objects: scene.objects.map(canonicalizeObject),
    incompatiblePairs: scene.incompatiblePairs.map(canonicalizeIncompatiblePair),
  }
}

function canonicalizeCanvas(canvas: CanvasSettings): CanvasSettings {
  return {
    width: canvas.width,
    height: canvas.height,
    gridSize: canvas.gridSize,
    showGrid: canvas.showGrid,
    snapToGrid: canvas.snapToGrid ?? true,
  }
}

function canonicalizeView(view: ViewSettings | undefined): ViewSettings {
  return {
    showLabels: view?.showLabels ?? true,
    activeView: view?.activeView ?? 'floorplan',
  }
}

function canonicalizeGuest(guest: Guest): Guest {
  return {
    id: guest.id,
    name: guest.name,
    groupId: guest.groupId,
    groupName: guest.groupName,
    vip: guest.vip,
    child: guest.child,
    accessibility: guest.accessibility,
    incompatibleWith: guest.incompatibleWith ? [...guest.incompatibleWith] : undefined,
    notes: guest.notes,
  }
}

function canonicalizeGroup(group: GuestGroup): GuestGroup {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
  }
}

function canonicalizeIncompatiblePair(pair: IncompatiblePair): IncompatiblePair {
  return {
    guestIdA: pair.guestIdA,
    guestIdB: pair.guestIdB,
    reason: pair.reason,
  }
}

function canonicalizeObject(object: SceneObject): SceneObject {
  if (object.type === 'table') return canonicalizeTable(object)
  if (object.type === 'label') return canonicalizeLabel(object)
  if (object.type === 'wall' || object.type === 'line' || object.type === 'door') return canonicalizeLinear(object)
  if (object.type === 'backgroundSvg') return canonicalizeBackgroundSvg(object)
  return canonicalizeArea(object as AreaObject)
}

function canonicalizeTable(table: TableObject): TableObject {
  return normalizeTableSeats({
    ...canonicalizeBase(table),
    type: 'table',
    shape: table.shape,
    tableNumber: table.tableNumber,
    tableName: table.tableName,
    chairMode: table.chairMode,
    seatCount: table.seatCount,
    perSide: canonicalizePerSide(table.perSide),
    seats: table.seats.map(canonicalizeSeat),
    mainTable: table.mainTable,
  })
}

function canonicalizeLabel(label: LabelObject): LabelObject {
  return {
    ...canonicalizeBase(label),
    type: 'label',
    text: label.text,
    fontSize: label.fontSize,
  }
}

function canonicalizeLinear(linear: LinearObject): LinearObject {
  return {
    ...canonicalizeBase(linear),
    type: linear.type,
    x2: linear.x2,
    y2: linear.y2,
  }
}

function canonicalizeArea(area: AreaObject): AreaObject {
  return {
    ...canonicalizeBase(area),
    type: area.type,
  }
}

function canonicalizeBackgroundSvg(background: BackgroundSvgObject): BackgroundSvgObject {
  return {
    ...canonicalizeBase(background),
    type: 'backgroundSvg',
    svg: background.svg,
  }
}

function canonicalizeBase(object: SceneObject) {
  return {
    id: object.id,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    label: object.label,
    locked: object.locked,
    fill: object.fill,
    stroke: object.stroke,
  }
}

function canonicalizePerSide(perSide: PerSideCounts): PerSideCounts {
  return {
    top: perSide.top,
    right: perSide.right,
    bottom: perSide.bottom,
    left: perSide.left,
  }
}

function canonicalizeSeat(seat: Seat): Seat {
  return {
    id: seat.id,
    label: seat.label,
    guestId: seat.guestId,
    side: seat.side,
  }
}

function isSceneLike(value: unknown): value is Scene {
  if (!isRecord(value)) return false

  return (
    value.schemaVersion === WEDDING_SEAT_MAP_SCHEMA_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.locale === 'en' || value.locale === 'pt-BR' || value.locale === 'es') &&
    isCanvas(value.canvas) &&
    (value.view === undefined || isView(value.view)) &&
    isArrayOf(value.guests, isGuest) &&
    isArrayOf(value.groups, isGroup) &&
    isArrayOf(value.objects, isSceneObject) &&
    isArrayOf(value.incompatiblePairs, isIncompatiblePair)
  )
}

function isCanvas(value: unknown): value is CanvasSettings {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.gridSize === 'number' &&
    typeof value.showGrid === 'boolean' &&
    (value.snapToGrid === undefined || typeof value.snapToGrid === 'boolean')
  )
}

function isView(value: unknown): value is ViewSettings {
  return (
    isRecord(value) &&
    typeof value.showLabels === 'boolean' &&
    (value.activeView === 'floorplan' || value.activeView === 'guestList')
  )
}

function isGuest(value: unknown): value is Guest {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

function isGroup(value: unknown): value is GuestGroup {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.color === 'string'
}

function isIncompatiblePair(value: unknown): value is IncompatiblePair {
  return isRecord(value) && typeof value.guestIdA === 'string' && typeof value.guestIdB === 'string'
}

function isSceneObject(value: unknown): value is SceneObject {
  if (!isRecord(value) || !isObjectType(value.type) || !hasBaseObjectFields(value)) return false

  if (value.type === 'table') {
    return (
      typeof value.shape === 'string' &&
      typeof value.tableNumber === 'string' &&
      typeof value.tableName === 'string' &&
      (value.chairMode === 'auto' || value.chairMode === 'manual') &&
      typeof value.seatCount === 'number' &&
      isPerSide(value.perSide) &&
      isArrayOf(value.seats, isSeat)
    )
  }

  if (value.type === 'label') {
    return typeof value.text === 'string' && typeof value.fontSize === 'number'
  }

  if (value.type === 'wall' || value.type === 'line' || value.type === 'door') {
    return typeof value.x2 === 'number' && typeof value.y2 === 'number'
  }

  if (value.type === 'backgroundSvg') {
    return typeof value.svg === 'string'
  }

  return true
}

function hasBaseObjectFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.rotation === 'number' &&
    typeof value.label === 'string'
  )
}

function isObjectType(value: unknown): value is ObjectType {
  return typeof value === 'string' && OBJECT_TYPES.includes(value as ObjectType)
}

function isPerSide(value: unknown): value is PerSideCounts {
  return (
    isRecord(value) &&
    typeof value.top === 'number' &&
    typeof value.right === 'number' &&
    typeof value.bottom === 'number' &&
    typeof value.left === 'number'
  )
}

function isSeat(value: unknown): value is Seat {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string'
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
