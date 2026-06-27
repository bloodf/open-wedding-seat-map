/**
 * Purpose: Produces automatic seating assignments that keep groups together and
 *          balance VIP, child, accessibility, and incompatibility constraints.
 *
 * Public API: autoSeatScene(scene, options), planAutoSeating(scene, options).
 *
 * Upstream deps: immutable scene assignment helpers and canonical domain types.
 *
 * Downstream consumers: auto-seating worker, editor command integration, tests.
 *
 * Failure modes: returns conflicts for capacity and rule pressure instead of
 *                throwing. No external side effects; safe to retry.
 *
 * Performance: O(clusters * tables * seats + assigned pairs) for typical event
 *              seating maps.
 */

import { getTables } from '../domain/scene'
import type { Guest, Scene, TableObject } from '../domain/types'

export interface AutoSeatingOptions {
  mainTableId?: string
  keepExistingAssignments?: boolean
}

export interface AutoSeatingResult {
  scene: Scene
  assignments: GuestAssignment[]
  conflicts: AutoSeatConflict[]
}

export interface GuestAssignment {
  guestId: string
  tableId: string
  seatId: string
}

export interface AutoSeatConflict {
  type: 'capacity' | 'incompatible' | 'unassigned'
  severity: 'warning' | 'error'
  message: string
  guestIds: string[]
  tableId?: string
}

interface GuestCluster {
  id: string
  label: string
  guests: Guest[]
  vip: boolean
  child: boolean
  accessibility: boolean
}

interface TableCandidate {
  table: TableObject
  compatible: boolean
  score: number
}

export function autoSeatScene(scene: Scene, options: AutoSeatingOptions = {}): AutoSeatingResult {
  return planAutoSeating(scene, options)
}

export function planAutoSeating(scene: Scene, options: AutoSeatingOptions = {}): AutoSeatingResult {
  const baseScene = options.keepExistingAssignments ? scene : clearAssignments(scene)
  const conflicts: AutoSeatConflict[] = []
  const assignments = collectExistingAssignments(baseScene)
  const assignedGuestIds = new Set(assignments.map((assignment) => assignment.guestId))
  const clusters = buildClusters(scene.guests.filter((guest) => !assignedGuestIds.has(guest.id))).sort(compareClusters)
  const tables = getTables(baseScene)
  const seating = createSeatingState(baseScene)
  const incompatibility = createIncompatibilityLookup(scene)

  clusters.forEach((cluster) => {
    const candidates = rankCandidates(baseScene, tables, seating, cluster, incompatibility, options)
    const chosen = candidates.find((candidate) => candidate.compatible) ?? candidates[0]

    if (!chosen) {
      conflicts.push({
        type: 'capacity',
        severity: 'error',
        message: `Could not seat ${cluster.label} together.`,
        guestIds: cluster.guests.map((guest) => guest.id),
      })
      return
    }

    if (!chosen.compatible) {
      conflicts.push({
        type: 'incompatible',
        severity: 'warning',
        message: `${cluster.label} could not avoid every incompatible pairing.`,
        guestIds: cluster.guests.map((guest) => guest.id),
        tableId: chosen.table.id,
      })
    }

    const freeSeats = seating.freeSeats.get(chosen.table.id) ?? []
    cluster.guests.forEach((guest) => {
      const seat = freeSeats.shift()
      if (!seat) return

      const assignment = { guestId: guest.id, tableId: chosen.table.id, seatId: seat.id }
      assignments.push(assignment)
      assignedGuestIds.add(guest.id)
      seating.guestIdsByTable.set(chosen.table.id, new Set([...(seating.guestIdsByTable.get(chosen.table.id) ?? []), guest.id]))
    })
  })

  scene.guests.forEach((guest) => {
    if (assignedGuestIds.has(guest.id)) return

    conflicts.push({
      type: 'unassigned',
      severity: 'warning',
      message: `${guest.name} is not seated.`,
      guestIds: [guest.id],
    })
  })

  const nextScene = applyAutoAssignments(clearAssignments(scene), assignments)
  conflicts.push(...findIncompatibleConflicts(nextScene, incompatibility))

  return { scene: nextScene, assignments, conflicts: dedupeConflicts(conflicts) }
}

function buildClusters(guests: Guest[]): GuestCluster[] {
  const grouped = new Map<string, Guest[]>()

  guests.forEach((guest) => {
    const key = guest.groupId ?? guest.groupName ?? (guest.child ? '__children__' : guest.id)
    grouped.set(key, [...(grouped.get(key) ?? []), guest])
  })

  return Array.from(grouped.entries()).map(([id, clusterGuests]) => ({
    id,
    label: id === '__children__' ? 'children' : clusterGuests[0]?.groupName || clusterGuests[0]?.name || id,
    guests: clusterGuests,
    vip: clusterGuests.some((guest) => guest.vip),
    child: clusterGuests.every((guest) => guest.child),
    accessibility: clusterGuests.some((guest) => guest.accessibility),
  }))
}

function compareClusters(a: GuestCluster, b: GuestCluster): number {
  return clusterPriority(b) - clusterPriority(a)
}

function clusterPriority(cluster: GuestCluster): number {
  return (
    Number(cluster.accessibility) * 1_000 +
    Number(cluster.vip) * 800 +
    Number(cluster.child) * 500 +
    cluster.guests.length * 25
  )
}

function rankCandidates(
  scene: Scene,
  tables: TableObject[],
  seating: ReturnType<typeof createSeatingState>,
  cluster: GuestCluster,
  incompatibility: Map<string, Set<string>>,
  options: AutoSeatingOptions,
): TableCandidate[] {
  return tables
    .filter((table) => (seating.freeSeats.get(table.id)?.length ?? 0) >= cluster.guests.length)
    .map((table) => ({
      table,
      compatible: isCompatibleWithTable(table, seating, cluster, incompatibility),
      score: tableScore(scene, table, seating, cluster, options),
    }))
    .sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score - a.score)
}

function tableScore(
  scene: Scene,
  table: TableObject,
  seating: ReturnType<typeof createSeatingState>,
  cluster: GuestCluster,
  options: AutoSeatingOptions,
): number {
  const mainTable = getMainTable(scene, options)
  const door = scene.objects.find((object) => object.type === 'door')
  const center = tableCenter(table)
  const freeSeats = seating.freeSeats.get(table.id)?.length ?? 0
  const exactFitBonus = Math.max(0, 100 - (freeSeats - cluster.guests.length) * 10)
  const mainTableScore = cluster.vip && mainTable ? 5_000 - distance(center, tableCenter(mainTable)) : 0
  const accessibilityScore = cluster.accessibility && door ? 3_000 - distance(center, { x: door.x, y: door.y }) : 0
  const childScore = cluster.child ? 1_000 - center.y / 2 : 0

  return exactFitBonus + mainTableScore + accessibilityScore + childScore + freeSeats
}

function isCompatibleWithTable(
  table: TableObject,
  seating: ReturnType<typeof createSeatingState>,
  cluster: GuestCluster,
  incompatibility: Map<string, Set<string>>,
): boolean {
  const existingGuestIds = seating.guestIdsByTable.get(table.id) ?? new Set<string>()
  const clusterGuestIds = new Set(cluster.guests.map((guest) => guest.id))

  return cluster.guests.every((guest) => {
    const incompatible = incompatibility.get(guest.id) ?? new Set<string>()
    return ![...incompatible].some((guestId) => existingGuestIds.has(guestId) || clusterGuestIds.has(guestId))
  })
}

function createSeatingState(scene: Scene): {
  freeSeats: Map<string, TableObject['seats']>
  guestIdsByTable: Map<string, Set<string>>
} {
  const freeSeats = new Map<string, TableObject['seats']>()
  const guestIdsByTable = new Map<string, Set<string>>()

  getTables(scene).forEach((table) => {
    freeSeats.set(
      table.id,
      table.seats.filter((seat) => !seat.guestId),
    )
    guestIdsByTable.set(table.id, new Set(table.seats.map((seat) => seat.guestId).filter((guestId): guestId is string => Boolean(guestId))))
  })

  return { freeSeats, guestIdsByTable }
}

function collectExistingAssignments(scene: Scene): GuestAssignment[] {
  return getTables(scene).flatMap((table) =>
    table.seats.flatMap((seat) => (seat.guestId ? [{ guestId: seat.guestId, tableId: table.id, seatId: seat.id }] : [])),
  )
}

function createIncompatibilityLookup(scene: Scene): Map<string, Set<string>> {
  const lookup = new Map<string, Set<string>>()

  scene.guests.forEach((guest) => {
    guest.incompatibleWith?.forEach((otherId) => addIncompatiblePair(lookup, guest.id, otherId))
  })
  scene.incompatiblePairs.forEach((pair) => addIncompatiblePair(lookup, pair.guestIdA, pair.guestIdB))

  return lookup
}

function addIncompatiblePair(lookup: Map<string, Set<string>>, guestIdA: string, guestIdB: string): void {
  lookup.set(guestIdA, new Set([...(lookup.get(guestIdA) ?? []), guestIdB]))
  lookup.set(guestIdB, new Set([...(lookup.get(guestIdB) ?? []), guestIdA]))
}

function findIncompatibleConflicts(scene: Scene, incompatibility: Map<string, Set<string>>): AutoSeatConflict[] {
  return getTables(scene).flatMap((table) => {
    const seatedIds = table.seats.map((seat) => seat.guestId).filter((guestId): guestId is string => Boolean(guestId))
    const conflicts: AutoSeatConflict[] = []

    seatedIds.forEach((guestId) => {
      const incompatible = incompatibility.get(guestId) ?? new Set<string>()
      seatedIds.forEach((otherId) => {
        if (guestId < otherId && incompatible.has(otherId)) {
          conflicts.push({
            type: 'incompatible',
            severity: 'error',
            message: 'Incompatible guests share a table.',
            guestIds: [guestId, otherId],
            tableId: table.id,
          })
        }
      })
    })

    return conflicts
  })
}

function dedupeConflicts(conflicts: AutoSeatConflict[]): AutoSeatConflict[] {
  const seen = new Set<string>()

  return conflicts.filter((conflict) => {
    const key = `${conflict.type}:${conflict.tableId ?? ''}:${conflict.guestIds.slice().sort().join(',')}:${conflict.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clearAssignments(scene: Scene): Scene {
  return {
    ...scene,
    objects: scene.objects.map((object) =>
      object.type === 'table'
        ? { ...object, seats: object.seats.map((seat) => ({ ...seat, guestId: undefined })) }
        : object,
    ),
  }
}

function applyAutoAssignments(scene: Scene, assignments: GuestAssignment[]): Scene {
  const assignmentBySeat = new Map(assignments.map((assignment) => [`${assignment.tableId}:${assignment.seatId}`, assignment.guestId]))

  return {
    ...scene,
    objects: scene.objects.map((object) =>
      object.type === 'table'
        ? {
            ...object,
            seats: object.seats.map((seat) => ({
              ...seat,
              guestId: assignmentBySeat.get(`${object.id}:${seat.id}`),
            })),
          }
        : object,
    ),
  }
}

function getMainTable(scene: Scene, options: AutoSeatingOptions): TableObject | undefined {
  const tables = getTables(scene)
  return tables.find((table) => table.id === options.mainTableId) ?? tables.find((table) => table.mainTable) ?? tables[0]
}

function tableCenter(table: TableObject): { x: number; y: number } {
  return {
    x: table.x + table.width / 2,
    y: table.y + table.height / 2,
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
