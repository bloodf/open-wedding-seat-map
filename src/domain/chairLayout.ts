/**
 * Purpose: Computes table seats and chair positions for all supported table
 *          shapes without depending on React or rendering state.
 *
 * Public API: createSeatsForTable(table), calculateChairPositions(table),
 *             normalizeTableSeats(table).
 *
 * Upstream deps: domain types only.
 *
 * Downstream consumers: editor SVG renderer, auto seating, CSV assignment
 *                       import, unit tests.
 *
 * Failure modes: clamps invalid counts to non-negative integers; callers should
 *                persist normalized tables after user edits to keep labels stable.
 *
 * Performance: O(n) per table where n is chair count.
 */

import type { ChairPosition, PerSideCounts, Seat, SeatSide, TableObject } from './types'

const SIDE_ORDER: SeatSide[] = ['top', 'right', 'bottom', 'left']

export function sanitizeSeatCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(80, Math.round(value)))
}

export function distributeSeats(total: number): PerSideCounts {
  const count = sanitizeSeatCount(total)
  const base = Math.floor(count / 4)
  const remainder = count % 4

  return {
    top: base + (remainder > 0 ? 1 : 0),
    right: base + (remainder > 1 ? 1 : 0),
    bottom: base + (remainder > 2 ? 1 : 0),
    left: base,
  }
}

export function totalPerSide(perSide: PerSideCounts): number {
  return SIDE_ORDER.reduce((total, side) => total + sanitizeSeatCount(perSide[side]), 0)
}

export function createSeatsForTable(table: Pick<TableObject, 'id' | 'chairMode' | 'seatCount' | 'perSide'>): Seat[] {
  const counts = table.chairMode === 'manual' ? table.perSide : distributeSeats(table.seatCount)
  const seats: Seat[] = []

  SIDE_ORDER.forEach((side) => {
    for (let index = 0; index < sanitizeSeatCount(counts[side]); index += 1) {
      seats.push({
        id: `${table.id}_${side}_${index + 1}`,
        label: `${seats.length + 1}`,
        side,
      })
    }
  })

  return seats
}

export function normalizeTableSeats(table: TableObject): TableObject {
  const perSide = table.chairMode === 'manual' ? table.perSide : distributeSeats(table.seatCount)
  const nextSeats = createSeatsForTable(table)
  const existingById = new Map(table.seats.map((seat) => [seat.id, seat]))

  return {
    ...table,
    perSide,
    seatCount: table.chairMode === 'manual' ? totalPerSide(perSide) : sanitizeSeatCount(table.seatCount),
    seats: nextSeats.map((seat) => ({ ...seat, guestId: existingById.get(seat.id)?.guestId })),
  }
}

export function calculateChairPositions(table: TableObject): ChairPosition[] {
  const normalized = normalizeTableSeats(table)

  if (table.shape === 'round') {
    return calculateRoundChairs(normalized)
  }

  return calculateSideChairs(normalized)
}

function calculateRoundChairs(table: TableObject): ChairPosition[] {
  const centerX = table.x + table.width / 2
  const centerY = table.y + table.height / 2
  const radius = Math.max(table.width, table.height) / 2 + 18
  const count = table.seats.length || 1

  return table.seats.map((seat, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2

    return {
      seatId: seat.id,
      label: seat.label,
      guestId: seat.guestId,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      angle,
      side: seat.side,
    }
  })
}

function calculateSideChairs(table: TableObject): ChairPosition[] {
  const bySide = SIDE_ORDER.reduce<Record<SeatSide, Seat[]>>(
    (acc, side) => ({ ...acc, [side]: table.seats.filter((seat) => seat.side === side) }),
    { top: [], right: [], bottom: [], left: [] },
  )

  return SIDE_ORDER.flatMap((side) =>
    bySide[side].map((seat, index) => calculateSideChair(table, seat, side, index, bySide[side].length)),
  )
}

function calculateSideChair(
  table: TableObject,
  seat: Seat,
  side: SeatSide,
  index: number,
  sideCount: number,
): ChairPosition {
  const fraction = (index + 1) / (sideCount + 1)
  const offset = 18

  if (side === 'top') {
    return {
      seatId: seat.id,
      label: seat.label,
      guestId: seat.guestId,
      x: table.x + table.width * fraction,
      y: table.y - offset,
      angle: -Math.PI / 2,
      side,
    }
  }

  if (side === 'right') {
    return {
      seatId: seat.id,
      label: seat.label,
      guestId: seat.guestId,
      x: table.x + table.width + offset,
      y: table.y + table.height * fraction,
      angle: 0,
      side,
    }
  }

  if (side === 'bottom') {
    return {
      seatId: seat.id,
      label: seat.label,
      guestId: seat.guestId,
      x: table.x + table.width * fraction,
      y: table.y + table.height + offset,
      angle: Math.PI / 2,
      side,
    }
  }

  return {
    seatId: seat.id,
    label: seat.label,
    guestId: seat.guestId,
    x: table.x - offset,
    y: table.y + table.height * fraction,
    angle: Math.PI,
    side,
  }
}
