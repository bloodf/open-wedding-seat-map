import type { AreaObject, Guest, IncompatiblePair, LinearObject, Scene, Seat, TableObject } from '../../src/domain/types'

export function makeAssignedScene(): Scene {
  const guests: Guest[] = [
    { id: 'guest_vip', name: 'Ada VIP', groupId: 'group_couple', groupName: 'Couple', vip: true },
    { id: 'guest_partner', name: 'Bea Partner', groupId: 'group_couple', groupName: 'Couple' },
    { id: 'guest_child_1', name: 'Ciro Child', child: true },
    { id: 'guest_child_2', name: 'Dina Child', child: true },
    { id: 'guest_access', name: 'Eli Access', accessibility: true },
    { id: 'guest_a', name: 'Faye North', incompatibleWith: ['guest_b'] },
    { id: 'guest_b', name: 'Gus South' },
  ]
  const incompatiblePairs: IncompatiblePair[] = [{ guestIdA: 'guest_a', guestIdB: 'guest_b', reason: 'Requested apart' }]

  return {
    schemaVersion: 1,
    id: 'scene_test',
    name: 'Test Wedding',
    updatedAt: '2026-06-27T12:00:00.000Z',
    locale: 'en',
    canvas: { width: 900, height: 620, gridSize: 24, showGrid: true, snapToGrid: true },
    view: { showLabels: true, activeView: 'floorplan' },
    guests,
    groups: [{ id: 'group_couple', name: 'Couple', color: '#0f766e' }],
    incompatiblePairs,
    objects: [
      makeDoor(),
      makeStage(),
      makeTable('table_main', '1', 100, 120, true, ['guest_vip', 'guest_partner', undefined, undefined]),
      makeTable('table_family', '2', 380, 140, false, ['guest_child_1', 'guest_child_2', undefined, undefined]),
      makeTable('table_back', '3', 690, 420, false, ['guest_access', 'guest_a', undefined, undefined]),
    ],
  }
}

export function makeUnassignedScene(): Scene {
  const scene = makeAssignedScene()

  return {
    ...scene,
    objects: scene.objects.map((object) =>
      object.type === 'table'
        ? { ...object, seats: object.seats.map((seat) => ({ ...seat, guestId: undefined })) }
        : object,
    ),
  }
}

function makeTable(id: string, tableNumber: string, x: number, y: number, mainTable: boolean, guestIds: Array<string | undefined>): TableObject {
  return {
    id,
    type: 'table',
    x,
    y,
    width: 128,
    height: 128,
    rotation: 0,
    label: `Table ${tableNumber}`,
    fill: '#ffffff',
    stroke: '#0f766e',
    shape: 'round',
    tableNumber,
    tableName: tableNumber === '1' ? 'Main table' : '',
    chairMode: 'manual',
    seatCount: 4,
    perSide: { top: 1, right: 1, bottom: 1, left: 1 },
    seats: makeSeats(id, guestIds),
    mainTable,
  }
}

function makeSeats(tableId: string, guestIds: Array<string | undefined>): Seat[] {
  const sides: Seat['side'][] = ['top', 'right', 'bottom', 'left']

  return sides.map((side, index) => ({
    id: `${tableId}_${side}_1`,
    label: String(index + 1),
    side,
    guestId: guestIds[index],
  }))
}

function makeDoor(): LinearObject {
  return {
    id: 'door_main',
    type: 'door',
    x: 760,
    y: 470,
    x2: 830,
    y2: 470,
    width: 70,
    height: 8,
    rotation: 0,
    label: 'Door',
    stroke: '#b45309',
  }
}

function makeStage(): AreaObject {
  return {
    id: 'stage_main',
    type: 'stage',
    x: 80,
    y: 20,
    width: 220,
    height: 72,
    rotation: 0,
    label: 'Stage',
    fill: '#f7d783',
    stroke: '#c58a15',
  }
}
