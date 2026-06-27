import { describe, expect, it } from 'vitest'
import { autoSeatScene } from '../src/autoSeating'
import { runAutoSeatingWorkerRequest } from '../src/workers/autoSeatingWorker'
import { makeUnassignedScene } from './fixtures/scene'

describe('auto seating', () => {
  it('keeps groups and children together while avoiding incompatible pairs when feasible', () => {
    const result = autoSeatScene(makeUnassignedScene())

    expect(result.assignments).toHaveLength(7)
    expect(tableFor(result.assignments, 'guest_vip')).toBe('table_main')
    expect(tableFor(result.assignments, 'guest_partner')).toBe('table_main')
    expect(tableFor(result.assignments, 'guest_child_1')).toBe(tableFor(result.assignments, 'guest_child_2'))
    expect(tableFor(result.assignments, 'guest_a')).not.toBe(tableFor(result.assignments, 'guest_b'))
    expect(result.conflicts.filter((conflict) => conflict.severity === 'error')).toEqual([])
  })

  it('reports capacity conflicts when a group cannot fit together', () => {
    const scene = makeUnassignedScene()
    const crowdedScene = {
      ...scene,
      guests: [
        ...scene.guests,
        { id: 'guest_extra_1', name: 'Extra One', groupId: 'group_large', groupName: 'Large Group' },
        { id: 'guest_extra_2', name: 'Extra Two', groupId: 'group_large', groupName: 'Large Group' },
        { id: 'guest_extra_3', name: 'Extra Three', groupId: 'group_large', groupName: 'Large Group' },
        { id: 'guest_extra_4', name: 'Extra Four', groupId: 'group_large', groupName: 'Large Group' },
        { id: 'guest_extra_5', name: 'Extra Five', groupId: 'group_large', groupName: 'Large Group' },
      ],
    }
    const result = autoSeatScene(crowdedScene)

    expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'capacity', severity: 'error' })]))
  })

  it('exposes the same solver through the worker request helper', () => {
    const response = runAutoSeatingWorkerRequest({ id: 'request_1', scene: makeUnassignedScene() })

    expect(response.ok).toBe(true)
    expect(response.id).toBe('request_1')
    expect(response.result?.assignments).toHaveLength(7)
  })
})

function tableFor(assignments: Array<{ guestId: string; tableId: string }>, guestId: string): string | undefined {
  return assignments.find((assignment) => assignment.guestId === guestId)?.tableId
}
