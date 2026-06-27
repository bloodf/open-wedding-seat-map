/**
 * Purpose: Defines the canonical Wedding Seat Map document model shared by the
 *          editor, chair layout routines, and later import/persistence slices.
 *
 * Public API: Scene, SceneObject, TableObject, Guest, Seat, create-style enums.
 *
 * Upstream deps: none.
 *
 * Downstream consumers: App editor UI, chair layout, local editor state, tests.
 *
 * Failure modes: type-only module; runtime validation is handled by import
 *                modules before foreign data is accepted as a Scene.
 *
 * Performance: standard.
 */

export type LocaleCode = 'en' | 'pt-BR' | 'es'

export type TableShape = 'round' | 'square' | 'rectangular'

export type SeatSide = 'top' | 'right' | 'bottom' | 'left'

export type ChairMode = 'auto' | 'manual'

export type ObjectType =
  | 'table'
  | 'label'
  | 'wall'
  | 'line'
  | 'door'
  | 'buffet'
  | 'bar'
  | 'stage'
  | 'danceFloor'
  | 'freeArea'
  | 'chair'
  | 'sofa'
  | 'decor'
  | 'backgroundSvg'

export type SceneObject =
  | TableObject
  | LabelObject
  | LinearObject
  | AreaObject
  | BackgroundSvgObject

export interface Scene {
  schemaVersion: 1
  id: string
  name: string
  updatedAt: string
  locale: LocaleCode
  canvas: CanvasSettings
  view?: ViewSettings
  guests: Guest[]
  groups: GuestGroup[]
  objects: SceneObject[]
  incompatiblePairs: IncompatiblePair[]
}

export interface CanvasSettings {
  width: number
  height: number
  gridSize: number
  showGrid: boolean
  snapToGrid?: boolean
}

export interface ViewSettings {
  showLabels: boolean
  activeView: 'floorplan' | 'guestList'
}

export interface Guest {
  id: string
  name: string
  groupId?: string
  groupName?: string
  vip?: boolean
  child?: boolean
  accessibility?: boolean
  incompatibleWith?: string[]
  notes?: string
}

export interface GuestGroup {
  id: string
  name: string
  color: string
}

export interface IncompatiblePair {
  guestIdA: string
  guestIdB: string
  reason?: string
}

export interface BaseObject {
  id: string
  type: ObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  label: string
  locked?: boolean
  fill?: string
  stroke?: string
}

export interface TableObject extends BaseObject {
  type: 'table'
  shape: TableShape
  tableNumber: string
  tableName: string
  chairMode: ChairMode
  seatCount: number
  perSide: PerSideCounts
  seats: Seat[]
  mainTable?: boolean
}

export interface Seat {
  id: string
  label: string
  guestId?: string
  side?: SeatSide
}

export interface PerSideCounts {
  top: number
  right: number
  bottom: number
  left: number
}

export interface LabelObject extends BaseObject {
  type: 'label'
  text: string
  fontSize: number
}

export interface LinearObject extends BaseObject {
  type: 'wall' | 'line' | 'door'
  x2: number
  y2: number
}

export interface AreaObject extends BaseObject {
  type: 'buffet' | 'bar' | 'stage' | 'danceFloor' | 'freeArea' | 'chair' | 'sofa' | 'decor'
}

export interface BackgroundSvgObject extends BaseObject {
  type: 'backgroundSvg'
  svg: string
}

export interface ChairPosition {
  seatId: string
  label: string
  guestId?: string
  x: number
  y: number
  angle: number
  side?: SeatSide
}

export interface AutoSeatConflict {
  type: 'capacity' | 'incompatible' | 'unassigned'
  severity: 'warning' | 'error'
  message: string
  guestIds: string[]
  tableId?: string
}

export interface GuestAssignment {
  guestId: string
  tableId: string
  seatId: string
}

export interface CsvImportResult {
  guests: Guest[]
  groups: GuestGroup[]
  assignments: GuestAssignment[]
  mode: 'simple' | 'roundTrip'
}

export type ToolId =
  | 'select'
  | 'tableRound'
  | 'tableSquare'
  | 'tableRect'
  | 'chair'
  | 'sofa'
  | 'wall'
  | 'door'
  | 'buffet'
  | 'bar'
  | 'stage'
  | 'danceFloor'
  | 'freeArea'
  | 'decor'
  | 'label'
