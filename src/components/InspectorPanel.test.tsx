import { fireEvent, render, screen } from '@testing-library/react'
import type { Dispatch } from 'react'
import type { TableObject } from '../domain/types'
import { createInitialEditorState, selectedObject, type EditorAction } from '../state/editorState'
import { InspectorPanel } from './InspectorPanel'

describe('InspectorPanel', () => {
  it('switches manual tables to auto mode when total seats are edited', () => {
    const state = createInitialEditorState()
    const table = selectedObject(state) as TableObject
    const dispatch = vi.fn() as unknown as Dispatch<EditorAction>

    expect(table.chairMode).toBe('manual')

    render(<InspectorPanel state={state} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('Total seats'), { target: { value: '8' } })

    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateObject',
      objectId: table.id,
      patch: { chairMode: 'auto', seatCount: 8 },
    })
  })
})
