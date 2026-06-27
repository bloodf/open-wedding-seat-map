import type { TableObject } from '../domain/types'
import { autoSeatScene } from '../autoSeating'
import { distributeSeats } from '../domain/chairLayout'
import { importSceneCsv, importSceneSvg } from '../io'
import { editorReducer, createInitialEditorState, selectedObject } from './editorState'

describe('editor state', () => {
  it('creates a selected table from an active table tool', () => {
    const state = createInitialEditorState()
    const withTool = editorReducer(state, { type: 'selectTool', tool: 'tableRect' })
    const next = editorReducer(withTool, { type: 'createObject', x: 240, y: 180 })

    expect(next.scene.objects.filter((object) => object.type === 'table')).toHaveLength(5)
    expect(selectedObject(next)?.type).toBe('table')
    expect(next.activeTool).toBe('select')
  })

  it('updates table identity and guest text locally', () => {
    const state = createInitialEditorState()
    const table = state.scene.objects.find((object) => object.type === 'table')
    expect(table).toBeDefined()

    const renamed = editorReducer(state, {
      type: 'updateObject',
      objectId: table!.id,
      patch: { tableName: 'Friends', tableNumber: 'A' },
    })
    const withGuests = editorReducer(renamed, {
      type: 'updateTableGuests',
      tableId: table!.id,
      text: 'Ana\nLuis\nMarta',
    })
    const updatedTable = withGuests.scene.objects.find(
      (object): object is TableObject => object.id === table!.id && object.type === 'table',
    )

    expect(updatedTable?.tableName).toBe('Friends')
    expect(withGuests.scene.guests.map((guest) => guest.name)).toEqual(expect.arrayContaining(['Ana', 'Luis', 'Marta']))
    expect(updatedTable?.seats.slice(0, 3).every((seat) => Boolean(seat.guestId))).toBe(true)
  })

  it('persists auto-mode total seat edits on selected tables', () => {
    const state = createInitialEditorState()
    const table = selectedObject(state)

    expect(table?.type).toBe('table')
    const next = editorReducer(state, {
      type: 'updateObject',
      objectId: table!.id,
      patch: { chairMode: 'auto', seatCount: 8 },
    })
    const updatedTable = selectedObject(next) as TableObject

    expect(updatedTable.chairMode).toBe('auto')
    expect(updatedTable.seatCount).toBe(8)
    expect(updatedTable.seats).toHaveLength(8)
    expect(updatedTable.perSide).toEqual(distributeSeats(8))
  })

  it('merges simple CSV guests into the current scene', () => {
    const state = createInitialEditorState()
    const result = importSceneCsv('name,groupName\nZoe Alvarez,Friends\nMina Costa,Family')
    const next = editorReducer(state, {
      type: 'mergeGuestImport',
      guests: result.guests,
      groups: result.groups,
      assignments: result.assignments,
      statusMessage: 'Guests imported',
    })

    expect(next.scene.guests.map((guest) => guest.name)).toEqual(expect.arrayContaining(['Zoe Alvarez', 'Mina Costa']))
    expect(next.scene.groups.map((group) => group.name)).toEqual(expect.arrayContaining(['Friends', 'Family']))
    expect(next.statusMessage).toBe('Guests imported')
  })

  it('adds arbitrary SVG imports as selected background objects', () => {
    const state = createInitialEditorState()
    const result = importSceneSvg('<svg width="120" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="80" /></svg>')

    expect(result.background).toBeDefined()
    const next = editorReducer(state, {
      type: 'addBackgroundSvg',
      background: result.background!,
      statusMessage: 'SVG background imported',
    })

    expect(next.selectedObjectId).toBe(result.background?.id)
    expect(next.scene.objects.at(-1)?.type).toBe('backgroundSvg')
  })

  it('applies auto seating results and stores conflict details', () => {
    const state = editorReducer(createInitialEditorState(), { type: 'resetScene' })
    const result = autoSeatScene(state.scene)
    const next = editorReducer(state, {
      type: 'applyAutoSeating',
      scene: result.scene,
      conflicts: result.conflicts,
      statusMessage: 'Auto seating applied',
    })

    const seated = next.scene.objects
      .filter((object): object is TableObject => object.type === 'table')
      .flatMap((table) => table.seats)
      .filter((seat) => seat.guestId)

    expect(seated.length).toBeGreaterThan(0)
    expect(next.autoSeatingConflicts).toEqual(result.conflicts)
    expect(next.statusMessage).toBe('Auto seating applied')
  })
})
