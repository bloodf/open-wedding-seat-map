import { calculateChairPositions, createSeatsForTable, distributeSeats, normalizeTableSeats } from './chairLayout'
import { createTableObject } from './scene'

describe('chair layout', () => {
  it('distributes automatic rectangular seats around all sides', () => {
    expect(distributeSeats(10)).toEqual({ top: 3, right: 3, bottom: 2, left: 2 })
  })

  it('creates manual seats with side metadata', () => {
    const table = createTableObject('rectangular', 10, 20, '1')
    const seats = createSeatsForTable({
      ...table,
      chairMode: 'manual',
      perSide: { top: 2, right: 1, bottom: 2, left: 1 },
    })

    expect(seats).toHaveLength(6)
    expect(seats.map((seat) => seat.side)).toEqual(['top', 'top', 'right', 'bottom', 'bottom', 'left'])
  })

  it('places round chairs on a circumference around the table center', () => {
    const table = createTableObject('round', 100, 100, '1')
    const chairs = calculateChairPositions({ ...table, seatCount: 4 })
    const center = { x: table.x + table.width / 2, y: table.y + table.height / 2 }
    const radii = chairs.map((chair) => Math.round(Math.hypot(chair.x - center.x, chair.y - center.y)))

    expect(new Set(radii)).toEqual(new Set([77]))
    expect(chairs[0].y).toBeLessThan(center.y)
  })

  it('preserves assigned guests when normalizing matching seats', () => {
    const table = createTableObject('square', 0, 0, '1')
    const assigned = {
      ...table,
      seats: table.seats.map((seat, index) => (index === 0 ? { ...seat, guestId: 'guest_1' } : seat)),
    }

    expect(normalizeTableSeats(assigned).seats[0].guestId).toBe('guest_1')
  })
})
