/**
 * Purpose: Imports and exports Wedding Seat Map CSV files in simple guest-list
 *          mode and full scene round-trip mode.
 *
 * Public API: exportGuestsCsv, exportSceneCsv, importSceneCsv.
 *
 * Upstream deps: Papa Parse, domain ID helpers, schema validation, domain types.
 *
 * Downstream consumers: file import/export UI and round-trip tests.
 *
 * Failure modes: throws SceneSchemaError for malformed full-scene CSV records.
 *                Simple guest CSV tolerates missing optional fields. No side
 *                effects; safe to retry.
 *
 * Performance: O(rows + scene size) in memory.
 */

import Papa from 'papaparse'
import { makeId, nowIso } from '../domain/ids'
import type {
  AreaObject,
  BackgroundSvgObject,
  Guest,
  GuestGroup,
  IncompatiblePair,
  LabelObject,
  LinearObject,
  ObjectType,
  Scene,
  SceneObject,
  Seat,
  TableObject,
} from '../domain/types'
import { canonicalizeScene, SceneSchemaError, validateSceneDocument, WEDDING_SEAT_MAP_SCHEMA_VERSION } from './schema'

export type CsvExportMode = 'simple' | 'roundTrip'

export interface GuestAssignment {
  guestId: string
  tableId: string
  seatId: string
}

export interface CsvSceneImportResult {
  scene?: Scene
  guests: Guest[]
  groups: GuestGroup[]
  assignments: GuestAssignment[]
  mode: 'simple' | 'roundTrip'
  warnings: string[]
}

const SIMPLE_GUEST_COLUMNS = [
  'id',
  'name',
  'group_id',
  'group',
  'vip',
  'child',
  'accessibility',
  'notes',
  'incompatible_with',
]

const ROUND_TRIP_COLUMNS = [
  'record_type',
  'schema_version',
  'id',
  'name',
  'updated_at',
  'locale',
  'canvas_width',
  'canvas_height',
  'grid_size',
  'show_grid',
  'snap_to_grid',
  'show_labels',
  'active_view',
  'object_type',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'label',
  'locked',
  'fill',
  'stroke',
  'shape',
  'table_number',
  'table_name',
  'chair_mode',
  'seat_count',
  'per_side_top',
  'per_side_right',
  'per_side_bottom',
  'per_side_left',
  'main_table',
  'table_id',
  'seat_id',
  'seat_label',
  'seat_side',
  'guest_id',
  'group_id',
  'group_name',
  'group_color',
  'vip',
  'child',
  'accessibility',
  'notes',
  'incompatible_with',
  'x2',
  'y2',
  'text',
  'font_size',
  'svg',
  'rule_type',
  'guest_id_a',
  'guest_id_b',
  'reason',
] as const

type CsvColumn = (typeof ROUND_TRIP_COLUMNS)[number]
type CsvRow = Partial<Record<CsvColumn, string>>
type ParsedCsvRow = Record<string, string | undefined>

export function exportGuestsCsv(scene: Scene): string {
  return Papa.unparse(
    scene.guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      group_id: guest.groupId ?? '',
      group: guest.groupName ?? '',
      vip: formatBoolean(guest.vip),
      child: formatBoolean(guest.child),
      accessibility: formatBoolean(guest.accessibility),
      notes: guest.notes ?? '',
      incompatible_with: guest.incompatibleWith?.join(';') ?? '',
    })),
    { columns: SIMPLE_GUEST_COLUMNS, newline: '\n' },
  )
}

export function exportSceneCsv(scene: Scene, mode: CsvExportMode = 'roundTrip'): string {
  if (mode === 'simple') return exportGuestsCsv(scene)

  const canonical = canonicalizeScene(scene)
  const rows: CsvRow[] = [createMapRow(canonical)]

  canonical.groups.forEach((group) => rows.push(createGroupRow(group)))
  canonical.guests.forEach((guest) => rows.push(createGuestRow(guest)))
  canonical.objects.forEach((object) => {
    rows.push(createObjectRow(object))

    if (object.type === 'table') {
      object.seats.forEach((seat) => rows.push(createSeatRow(object, seat)))
      object.seats.forEach((seat) => {
        if (seat.guestId) rows.push(createAssignmentRow(object.id, seat))
      })
    }
  })
  canonical.incompatiblePairs.forEach((pair) => rows.push(createRuleRow(pair)))

  return Papa.unparse(rows, { columns: [...ROUND_TRIP_COLUMNS], newline: '\n' })
}

export function importSceneCsv(csv: string): CsvSceneImportResult {
  const parsed = Papa.parse<ParsedCsvRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transform: (value) => (typeof value === 'string' ? value.trim() : value),
  })

  if (parsed.errors.length > 0) {
    throw new SceneSchemaError(parsed.errors.map((error) => error.message).join('; '))
  }

  const fields = parsed.meta.fields ?? []
  const hasRecordType = fields.includes('record_type') && parsed.data.some((row) => valueOf(row, 'record_type') !== '')

  return hasRecordType ? importRoundTripRows(parsed.data) : importSimpleGuestRows(parsed.data)
}

function importSimpleGuestRows(rows: ParsedCsvRow[]): CsvSceneImportResult {
  const guests = rows
    .filter((row) => valueOf(row, 'name') !== '')
    .map((row): Guest => {
      const groupName = valueOf(row, 'group') || valueOf(row, 'group_name') || valueOf(row, 'groupName')
      const groupId = valueOf(row, 'group_id') || valueOf(row, 'groupId') || (groupName ? slugId('group', groupName) : undefined)

      return {
        id: valueOf(row, 'id') || makeId('guest'),
        name: valueOf(row, 'name'),
        groupId,
        groupName: groupName || undefined,
        vip: parseBoolean(valueOf(row, 'vip')) || undefined,
        child: parseBoolean(valueOf(row, 'child')) || undefined,
        accessibility: parseBoolean(valueOf(row, 'accessibility')) || undefined,
        notes: valueOf(row, 'notes') || undefined,
        incompatibleWith: splitList(valueOf(row, 'incompatible_with') || valueOf(row, 'incompatibleWith')),
      }
    })

  return {
    guests,
    groups: deriveGroups(guests),
    assignments: [],
    mode: 'simple',
    warnings: [],
  }
}

function importRoundTripRows(rows: ParsedCsvRow[]): CsvSceneImportResult {
  rows.forEach(assertSupportedRowVersion)

  const mapRow = rows.find((row) => valueOf(row, 'record_type') === 'map')
  if (!mapRow) throw new SceneSchemaError('Full CSV is missing a map row.')

  const guestRows = rows.filter((row) => valueOf(row, 'record_type') === 'guest')
  const groupRows = rows.filter((row) => valueOf(row, 'record_type') === 'group')
  const seatRows = rows.filter((row) => valueOf(row, 'record_type') === 'seat')
  const assignmentRows = rows.filter((row) => valueOf(row, 'record_type') === 'assignment')
  const ruleRows = rows.filter((row) => valueOf(row, 'record_type') === 'rule')
  const assignments = assignmentRows.map(rowToAssignment).filter((assignment): assignment is GuestAssignment => Boolean(assignment))
  const assignmentBySeat = new Map(assignments.map((assignment) => [`${assignment.tableId}:${assignment.seatId}`, assignment.guestId]))
  const seatsByTable = groupSeatsByTable(seatRows, assignmentBySeat)
  const sceneCandidate: Scene = {
    schemaVersion: WEDDING_SEAT_MAP_SCHEMA_VERSION,
    id: requiredValue(mapRow, 'id', 'map id'),
    name: requiredValue(mapRow, 'name', 'map name'),
    updatedAt: valueOf(mapRow, 'updated_at') || nowIso(),
    locale: parseLocale(valueOf(mapRow, 'locale')),
    canvas: {
      width: parseNumber(requiredValue(mapRow, 'canvas_width', 'canvas width')),
      height: parseNumber(requiredValue(mapRow, 'canvas_height', 'canvas height')),
      gridSize: parseNumber(requiredValue(mapRow, 'grid_size', 'grid size')),
      showGrid: parseBoolean(valueOf(mapRow, 'show_grid')),
      snapToGrid: parseBoolean(valueOf(mapRow, 'snap_to_grid')),
    },
    view: {
      showLabels: valueOf(mapRow, 'show_labels') === '' ? true : parseBoolean(valueOf(mapRow, 'show_labels')),
      activeView: valueOf(mapRow, 'active_view') === 'guestList' ? 'guestList' : 'floorplan',
    },
    groups: groupRows.map(rowToGroup),
    guests: guestRows.map(rowToGuest),
    objects: rows.flatMap((row): SceneObject[] => {
      if (valueOf(row, 'record_type') === 'table') return [rowToTable(row, seatsByTable)]
      if (valueOf(row, 'record_type') === 'object') return [rowToObject(row)]
      return []
    }),
    incompatiblePairs: ruleRows.map(rowToRule).filter((rule): rule is IncompatiblePair => Boolean(rule)),
  }

  const { scene, warnings } = validateSceneDocument(sceneCandidate)

  return {
    scene,
    guests: scene.guests,
    groups: scene.groups,
    assignments,
    mode: 'roundTrip',
    warnings,
  }
}

function createMapRow(scene: Scene): CsvRow {
  return withVersion({
    record_type: 'map',
    id: scene.id,
    name: scene.name,
    updated_at: scene.updatedAt,
    locale: scene.locale,
    canvas_width: String(scene.canvas.width),
    canvas_height: String(scene.canvas.height),
    grid_size: String(scene.canvas.gridSize),
    show_grid: formatBoolean(scene.canvas.showGrid),
    snap_to_grid: formatBoolean(scene.canvas.snapToGrid),
    show_labels: formatBoolean(scene.view?.showLabels ?? true),
    active_view: scene.view?.activeView ?? 'floorplan',
  })
}

function createGroupRow(group: GuestGroup): CsvRow {
  return withVersion({
    record_type: 'group',
    id: group.id,
    name: group.name,
    group_color: group.color,
  })
}

function createGuestRow(guest: Guest): CsvRow {
  return withVersion({
    record_type: 'guest',
      id: guest.id,
      name: guest.name,
      group_id: guest.groupId ?? '',
      group_name: guest.groupName ?? '',
      vip: formatOptionalBoolean(guest.vip),
      child: formatOptionalBoolean(guest.child),
      accessibility: formatOptionalBoolean(guest.accessibility),
    notes: guest.notes ?? '',
    incompatible_with: guest.incompatibleWith?.join(';') ?? '',
  })
}

function createObjectRow(object: SceneObject): CsvRow {
  const base = withVersion({
    record_type: object.type === 'table' ? 'table' : 'object',
    id: object.id,
    object_type: object.type,
    x: String(object.x),
    y: String(object.y),
    width: String(object.width),
    height: String(object.height),
    rotation: String(object.rotation),
    label: object.label,
    locked: formatOptionalBoolean(object.locked),
    fill: object.fill ?? '',
    stroke: object.stroke ?? '',
  })

  if (object.type === 'table') {
    return {
      ...base,
      shape: object.shape,
      table_number: object.tableNumber,
      table_name: object.tableName,
      chair_mode: object.chairMode,
      seat_count: String(object.seatCount),
      per_side_top: String(object.perSide.top),
      per_side_right: String(object.perSide.right),
      per_side_bottom: String(object.perSide.bottom),
      per_side_left: String(object.perSide.left),
      main_table: formatOptionalBoolean(object.mainTable),
    }
  }

  if (object.type === 'label') {
    return { ...base, text: object.text, font_size: String(object.fontSize) }
  }

  if (object.type === 'wall' || object.type === 'line' || object.type === 'door') {
    return { ...base, x2: String(object.x2), y2: String(object.y2) }
  }

  if (object.type === 'backgroundSvg') {
    return { ...base, svg: object.svg }
  }

  return base
}

function createSeatRow(table: TableObject, seat: Seat): CsvRow {
  return withVersion({
    record_type: 'seat',
    id: `${table.id}:${seat.id}`,
    table_id: table.id,
    table_number: table.tableNumber,
    guest_id: seat.guestId ?? '',
    seat_id: seat.id,
    seat_label: seat.label,
    seat_side: seat.side ?? '',
  })
}

function createAssignmentRow(tableId: string, seat: Seat): CsvRow {
  return withVersion({
    record_type: 'assignment',
    id: `${tableId}:${seat.id}:${seat.guestId}`,
    guest_id: seat.guestId ?? '',
    seat_id: seat.id,
    table_id: tableId,
  })
}

function createRuleRow(pair: IncompatiblePair): CsvRow {
  return withVersion({
    record_type: 'rule',
    id: `${pair.guestIdA}:${pair.guestIdB}`,
    rule_type: 'incompatible',
    guest_id_a: pair.guestIdA,
    guest_id_b: pair.guestIdB,
    reason: pair.reason ?? '',
  })
}

function rowToGroup(row: ParsedCsvRow): GuestGroup {
  return {
    id: requiredValue(row, 'id', 'group id'),
    name: requiredValue(row, 'name', 'group name'),
    color: valueOf(row, 'group_color') || '#0f766e',
  }
}

function rowToGuest(row: ParsedCsvRow): Guest {
  return {
    id: requiredValue(row, 'id', 'guest id'),
    name: requiredValue(row, 'name', 'guest name'),
    groupId: valueOf(row, 'group_id') || valueOf(row, 'groupId') || undefined,
    groupName: valueOf(row, 'group_name') || valueOf(row, 'groupName') || valueOf(row, 'group') || undefined,
    vip: parseOptionalBoolean(valueOf(row, 'vip')),
    child: parseOptionalBoolean(valueOf(row, 'child')),
    accessibility: parseOptionalBoolean(valueOf(row, 'accessibility')),
    notes: valueOf(row, 'notes') || undefined,
    incompatibleWith: splitList(valueOf(row, 'incompatible_with') || valueOf(row, 'incompatibleWith')),
  }
}

function rowToTable(row: ParsedCsvRow, seatsByTable: Map<string, Seat[]>): TableObject {
  const tableId = requiredValue(row, 'id', 'table id')

  return {
    id: tableId,
    type: 'table',
    x: parseNumber(requiredValue(row, 'x', 'table x')),
    y: parseNumber(requiredValue(row, 'y', 'table y')),
    width: parseNumber(requiredValue(row, 'width', 'table width')),
    height: parseNumber(requiredValue(row, 'height', 'table height')),
    rotation: parseNumber(valueOf(row, 'rotation') || '0'),
    label: valueOf(row, 'label') || `Table ${valueOf(row, 'table_number') || tableId}`,
    locked: parseOptionalBoolean(valueOf(row, 'locked')),
    fill: valueOf(row, 'fill') || undefined,
    stroke: valueOf(row, 'stroke') || undefined,
    shape: parseTableShape(valueOf(row, 'shape')),
    tableNumber: valueOf(row, 'table_number') || tableId,
    tableName: valueOf(row, 'table_name'),
    chairMode: valueOf(row, 'chair_mode') === 'manual' ? 'manual' : 'auto',
    seatCount: parseNumber(requiredValue(row, 'seat_count', 'seat count')),
    perSide: {
      top: parseNumber(valueOf(row, 'per_side_top') || '0'),
      right: parseNumber(valueOf(row, 'per_side_right') || '0'),
      bottom: parseNumber(valueOf(row, 'per_side_bottom') || '0'),
      left: parseNumber(valueOf(row, 'per_side_left') || '0'),
    },
    seats: seatsByTable.get(tableId) ?? [],
    mainTable: parseOptionalBoolean(valueOf(row, 'main_table')),
  }
}

function rowToObject(row: ParsedCsvRow): Exclude<SceneObject, TableObject> {
  const objectType = parseObjectType(requiredValue(row, 'object_type', 'object type'))
  const base = {
    id: requiredValue(row, 'id', 'object id'),
    x: parseNumber(requiredValue(row, 'x', 'object x')),
    y: parseNumber(requiredValue(row, 'y', 'object y')),
    width: parseNumber(requiredValue(row, 'width', 'object width')),
    height: parseNumber(requiredValue(row, 'height', 'object height')),
    rotation: parseNumber(valueOf(row, 'rotation') || '0'),
    label: valueOf(row, 'label') || objectType,
    locked: parseOptionalBoolean(valueOf(row, 'locked')),
    fill: valueOf(row, 'fill') || undefined,
    stroke: valueOf(row, 'stroke') || undefined,
  }

  if (objectType === 'label') {
    return {
      ...base,
      type: 'label',
      text: valueOf(row, 'text') || base.label,
      fontSize: parseNumber(valueOf(row, 'font_size') || '18'),
    } satisfies LabelObject
  }

  if (objectType === 'wall' || objectType === 'line' || objectType === 'door') {
    return {
      ...base,
      type: objectType,
      x2: parseNumber(requiredValue(row, 'x2', 'line x2')),
      y2: parseNumber(requiredValue(row, 'y2', 'line y2')),
    } satisfies LinearObject
  }

  if (objectType === 'backgroundSvg') {
    return {
      ...base,
      type: 'backgroundSvg',
      svg: valueOf(row, 'svg'),
    } satisfies BackgroundSvgObject
  }

  return {
    ...base,
    type: objectType,
  } satisfies AreaObject
}

function rowToAssignment(row: ParsedCsvRow): GuestAssignment | undefined {
  const guestId = valueOf(row, 'guest_id')
  const seatId = valueOf(row, 'seat_id')
  const tableId = valueOf(row, 'table_id')

  if (!guestId || !seatId || !tableId) return undefined
  return { guestId, tableId, seatId }
}

function rowToRule(row: ParsedCsvRow): IncompatiblePair | undefined {
  if (valueOf(row, 'rule_type') !== 'incompatible') return undefined

  return {
    guestIdA: requiredValue(row, 'guest_id_a', 'incompatible guest A'),
    guestIdB: requiredValue(row, 'guest_id_b', 'incompatible guest B'),
    reason: valueOf(row, 'reason') || undefined,
  }
}

function groupSeatsByTable(rows: ParsedCsvRow[], assignmentBySeat: Map<string, string>): Map<string, Seat[]> {
  const byTable = new Map<string, Seat[]>()

  rows.forEach((row) => {
    const tableId = requiredValue(row, 'table_id', 'seat table id')
    const seatId = requiredValue(row, 'seat_id', 'seat id')
    const guestId = valueOf(row, 'guest_id') || assignmentBySeat.get(`${tableId}:${seatId}`)
    const seat: Seat = {
      id: seatId,
      label: valueOf(row, 'seat_label') || seatId,
      side: parseSeatSide(valueOf(row, 'seat_side')),
      guestId: guestId || undefined,
    }

    byTable.set(tableId, [...(byTable.get(tableId) ?? []), seat])
  })

  return byTable
}

function withVersion(row: CsvRow): CsvRow {
  return {
    ...row,
    schema_version: String(WEDDING_SEAT_MAP_SCHEMA_VERSION),
  }
}

function assertSupportedRowVersion(row: ParsedCsvRow): void {
  const version = valueOf(row, 'schema_version')
  if (version !== String(WEDDING_SEAT_MAP_SCHEMA_VERSION)) {
    throw new SceneSchemaError(`Unsupported CSV schema version: ${version || '(blank)'}.`)
  }
}

function deriveGroups(guests: Guest[]): GuestGroup[] {
  const groups = new Map<string, GuestGroup>()
  const colors = ['#0f766e', '#be123c', '#b45309', '#2563eb', '#6d28d9', '#15803d']

  guests.forEach((guest) => {
    const key = guest.groupId ?? guest.groupName
    if (!key || groups.has(key)) return

    groups.set(key, {
      id: guest.groupId ?? key,
      name: guest.groupName ?? key,
      color: colors[groups.size % colors.length],
    })
  })

  return Array.from(groups.values())
}

function valueOf(row: ParsedCsvRow, column: string): string {
  return row[column]?.trim() ?? ''
}

function requiredValue(row: ParsedCsvRow, column: string, label: string): string {
  const value = valueOf(row, column)
  if (!value) throw new SceneSchemaError(`Missing ${label}.`)
  return value
}

function parseNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new SceneSchemaError(`Invalid number: ${value}.`)
  return parsed
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value ?? '').toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y'
}

function parseOptionalBoolean(value: string): boolean | undefined {
  return value === '' ? undefined : parseBoolean(value)
}

function formatBoolean(value: boolean | undefined): string {
  return value ? 'true' : ''
}

function formatOptionalBoolean(value: boolean | undefined): string {
  if (value === undefined) return ''
  return value ? 'true' : 'false'
}

function splitList(value: string): string[] | undefined {
  const items = value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}

function parseLocale(value: string): Scene['locale'] {
  return value === 'pt-BR' || value === 'es' ? value : 'en'
}

function parseTableShape(value: string): TableObject['shape'] {
  if (value === 'square' || value === 'rectangular') return value
  return 'round'
}

function parseSeatSide(value: string): Seat['side'] {
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value
  return undefined
}

function parseObjectType(value: string): Exclude<ObjectType, 'table'> {
  if (
    value === 'label' ||
    value === 'wall' ||
    value === 'line' ||
    value === 'door' ||
    value === 'buffet' ||
    value === 'bar' ||
    value === 'stage' ||
    value === 'danceFloor' ||
    value === 'freeArea' ||
    value === 'chair' ||
    value === 'sofa' ||
    value === 'decor' ||
    value === 'backgroundSvg'
  ) {
    return value
  }

  throw new SceneSchemaError(`Unsupported object type: ${value}.`)
}

function slugId(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `${prefix}_${slug || 'group'}`
}
