/**
 * Purpose: Generates a printable PDF kit containing the floor map, table lists,
 *          alphabetical guest list, table cards, and place labels.
 *
 * Public API: buildPdfKit(scene), generatePdfKit(scene, options).
 *
 * Upstream deps: jsPDF, chair-position helpers, and canonical domain types.
 *
 * Downstream consumers: export UI, print flows, and PDF smoke tests.
 *
 * Failure modes: throws only if jsPDF cannot create or output the document.
 *                Generation is read-only and safe to retry.
 *
 * Performance: O(objects + seats + guests); synchronous browser PDF generation.
 */

import { jsPDF } from 'jspdf'
import { calculateChairPositions } from '../domain/chairLayout'
import { getTables } from '../domain/scene'
import type { Guest, Scene, SceneObject, TableObject } from '../domain/types'

export type PdfOutputFormat = 'arraybuffer' | 'blob' | 'datauristring'

export type PdfKitOutput<T extends PdfOutputFormat> = T extends 'arraybuffer'
  ? ArrayBuffer
  : T extends 'blob'
    ? Blob
    : string

export interface PdfKitOptions<T extends PdfOutputFormat = 'arraybuffer'> {
  output?: T
  title?: string
}

interface PositionedGuest {
  guest: Guest
  table: TableObject
  seatLabel: string
}

const PAGE_MARGIN = 36
const LINE_HEIGHT = 14

export function buildPdfKit(scene: Scene, title = scene.name): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  drawMapPage(doc, scene, title)
  doc.addPage()
  drawTableListPage(doc, scene)
  doc.addPage()
  drawAlphabeticalGuestPage(doc, scene)
  doc.addPage()
  drawTableCardsPage(doc, scene)
  doc.addPage()
  drawPlaceLabelsPage(doc, scene)

  return doc
}

export function generatePdfKit<T extends PdfOutputFormat = 'arraybuffer'>(
  scene: Scene,
  options: PdfKitOptions<T> = {},
): PdfKitOutput<T> {
  const output = options.output ?? 'arraybuffer'
  const doc = buildPdfKit(scene, options.title)

  if (output === 'blob') {
    return doc.output('blob') as PdfKitOutput<T>
  }

  if (output === 'datauristring') {
    return doc.output('datauristring') as PdfKitOutput<T>
  }

  return doc.output('arraybuffer') as PdfKitOutput<T>
}

function drawMapPage(doc: jsPDF, scene: Scene, title: string): void {
  addTitle(doc, title, 'Map')

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const scale = Math.min((pageWidth - PAGE_MARGIN * 2) / scene.canvas.width, (pageHeight - 90) / scene.canvas.height)
  const originX = (pageWidth - scene.canvas.width * scale) / 2
  const originY = 68

  setStroke(doc, '#cbd5e1')
  doc.rect(originX, originY, scene.canvas.width * scale, scene.canvas.height * scale)

  scene.objects.forEach((object) => drawMapObject(doc, scene, object, originX, originY, scale))
}

function drawTableListPage(doc: jsPDF, scene: Scene): void {
  addTitle(doc, scene.name, 'List by table')
  const writer = createLineWriter(doc, 72)

  getTables(scene).forEach((table) => {
    writer(`${tableLabel(table)} (${table.seats.filter((seat) => seat.guestId).length}/${table.seats.length})`, true)
    table.seats.forEach((seat) => {
      const guest = scene.guests.find((item) => item.id === seat.guestId)
      writer(`${seat.label}. ${guest?.name ?? 'Open seat'}`)
    })
    writer('')
  })
}

function drawAlphabeticalGuestPage(doc: jsPDF, scene: Scene): void {
  addTitle(doc, scene.name, 'Alphabetical guest list')
  const writer = createLineWriter(doc, 72)
  const positioned = getPositionedGuests(scene)
  const byGuest = new Map(positioned.map((item) => [item.guest.id, item]))
  const sortedGuests = [...scene.guests].sort((a, b) => a.name.localeCompare(b.name))

  sortedGuests.forEach((guest) => {
    const seat = byGuest.get(guest.id)
    writer(seat ? `${guest.name} - ${tableLabel(seat.table)}, seat ${seat.seatLabel}` : `${guest.name} - Unassigned`)
  })
}

function drawTableCardsPage(doc: jsPDF, scene: Scene): void {
  addTitle(doc, scene.name, 'Table cards')
  const tables = getTables(scene)
  const pageWidth = doc.internal.pageSize.getWidth()
  const cardWidth = (pageWidth - PAGE_MARGIN * 2 - 18) / 2
  const cardHeight = 126
  let x = PAGE_MARGIN
  let y = 72

  tables.forEach((table, index) => {
    if (y + cardHeight > doc.internal.pageSize.getHeight() - PAGE_MARGIN) {
      doc.addPage()
      addTitle(doc, scene.name, 'Table cards')
      x = PAGE_MARGIN
      y = 72
    }

    drawTableCard(doc, scene, table, x, y, cardWidth, cardHeight)
    x = index % 2 === 0 ? PAGE_MARGIN + cardWidth + 18 : PAGE_MARGIN
    y = index % 2 === 0 ? y : y + cardHeight + 18
  })
}

function drawPlaceLabelsPage(doc: jsPDF, scene: Scene): void {
  addTitle(doc, scene.name, 'Place labels')
  const positioned = getPositionedGuests(scene).sort((a, b) => a.guest.name.localeCompare(b.guest.name))
  const labelWidth = 168
  const labelHeight = 72
  const gap = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const perRow = Math.max(1, Math.floor((pageWidth - PAGE_MARGIN * 2 + gap) / (labelWidth + gap)))
  let row = 0
  let column = 0

  positioned.forEach((item) => {
    const y = 72 + row * (labelHeight + gap)

    if (y + labelHeight > doc.internal.pageSize.getHeight() - PAGE_MARGIN) {
      doc.addPage()
      addTitle(doc, scene.name, 'Place labels')
      row = 0
      column = 0
    }

    drawPlaceLabel(doc, item, PAGE_MARGIN + column * (labelWidth + gap), 72 + row * (labelHeight + gap), labelWidth, labelHeight)
    column += 1

    if (column >= perRow) {
      column = 0
      row += 1
    }
  })
}

function drawMapObject(doc: jsPDF, scene: Scene, object: SceneObject, originX: number, originY: number, scale: number): void {
  const x = originX + object.x * scale
  const y = originY + object.y * scale
  const width = object.width * scale
  const height = object.height * scale

  setStroke(doc, object.stroke ?? '#94a3b8')
  setFill(doc, object.fill ?? '#f8fafc')

  if (object.type === 'table') {
    if (object.shape === 'round') {
      doc.circle(x + width / 2, y + height / 2, Math.max(width, height) / 2, 'FD')
    } else {
      doc.rect(x, y, width, height, 'FD')
    }

    doc.setFontSize(8)
    doc.text(tableLabel(object), x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' })
    calculateChairPositions(object).forEach((chair) => {
      const guest = scene.guests.find((item) => item.id === chair.guestId)
      doc.circle(originX + chair.x * scale, originY + chair.y * scale, 4, 'S')
      if (guest) doc.text(guest.name.slice(0, 12), originX + chair.x * scale + 6, originY + chair.y * scale + 3)
    })
    return
  }

  if (object.type === 'label') {
    doc.setFontSize(Math.max(8, object.fontSize * scale))
    doc.text(object.text, x, y)
    return
  }

  if (object.type === 'wall' || object.type === 'line' || object.type === 'door') {
    setStroke(doc, object.stroke ?? '#475569')
    doc.setLineWidth(object.type === 'door' ? 4 : 3)
    doc.line(x, y, originX + object.x2 * scale, originY + object.y2 * scale)
    doc.setLineWidth(1)
    return
  }

  if (object.type === 'backgroundSvg') return

  doc.rect(x, y, width, height, 'FD')
  doc.setFontSize(8)
  doc.text(object.label, x + width / 2, y + height / 2, { align: 'center', baseline: 'middle' })
}

function drawTableCard(doc: jsPDF, scene: Scene, table: TableObject, x: number, y: number, width: number, height: number): void {
  setStroke(doc, '#0f766e')
  setFill(doc, '#ffffff')
  doc.rect(x, y, width, height, 'FD')
  doc.setFontSize(14)
  doc.text(tableLabel(table), x + 12, y + 22)
  doc.setFontSize(9)

  table.seats.forEach((seat, index) => {
    const guest = scene.guests.find((item) => item.id === seat.guestId)
    const column = index % 2
    const row = Math.floor(index / 2)
    doc.text(`${seat.label}. ${guest?.name ?? ''}`.trim(), x + 12 + column * (width / 2), y + 44 + row * 12)
  })
}

function drawPlaceLabel(doc: jsPDF, item: PositionedGuest, x: number, y: number, width: number, height: number): void {
  setStroke(doc, '#94a3b8')
  setFill(doc, '#ffffff')
  doc.rect(x, y, width, height, 'FD')
  doc.setFontSize(14)
  doc.text(item.guest.name, x + width / 2, y + 28, { align: 'center' })
  doc.setFontSize(10)
  doc.text(`${tableLabel(item.table)} - Seat ${item.seatLabel}`, x + width / 2, y + 48, { align: 'center' })
}

function getPositionedGuests(scene: Scene): PositionedGuest[] {
  return getTables(scene).flatMap((table) =>
    table.seats.flatMap((seat) => {
      const guest = scene.guests.find((item) => item.id === seat.guestId)
      return guest ? [{ guest, table, seatLabel: seat.label }] : []
    }),
  )
}

function createLineWriter(doc: jsPDF, startY: number): (line: string, bold?: boolean) => void {
  let y = startY

  return (line: string, bold = false) => {
    if (y > doc.internal.pageSize.getHeight() - PAGE_MARGIN) {
      doc.addPage()
      y = PAGE_MARGIN
    }

    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 9)
    doc.text(line, PAGE_MARGIN, y)
    y += line === '' ? LINE_HEIGHT / 2 : LINE_HEIGHT
    doc.setFont('helvetica', 'normal')
  }
}

function addTitle(doc: jsPDF, title: string, section: string): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, PAGE_MARGIN, 34)
  doc.setFontSize(11)
  doc.text(section, PAGE_MARGIN, 52)
  doc.setFont('helvetica', 'normal')
}

function tableLabel(table: TableObject): string {
  return table.tableName || table.label || `Table ${table.tableNumber}`
}

function setStroke(doc: jsPDF, color: string): void {
  const [r, g, b] = hexToRgb(color)
  doc.setDrawColor(r, g, b)
}

function setFill(doc: jsPDF, color: string): void {
  const [r, g, b] = hexToRgb(color)
  doc.setFillColor(r, g, b)
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.startsWith('#') ? color.slice(1) : color
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [255, 255, 255]

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}
