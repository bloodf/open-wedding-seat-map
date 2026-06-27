import { describe, expect, it } from 'vitest'
import { canonicalizeScene, importSceneCsv, importSceneJson, importSceneSvg, exportSceneCsv, exportSceneJson, exportSceneSvg, generatePdfKit, WEDDING_SEAT_MAP_MIME } from '../src/io'
import { makeAssignedScene } from './fixtures/scene'

describe('scene JSON import and export', () => {
  it('round-trips canonical editable JSON and rejects unsupported schema versions', () => {
    const scene = makeAssignedScene()
    const json = exportSceneJson(scene)

    expect(json).toContain('"schemaVersion": 1')
    expect(importSceneJson(json).scene).toEqual(canonicalizeScene(scene))
    expect(() => importSceneJson(json.replace('"schemaVersion": 1', '"schemaVersion": 2'))).toThrow(/Unsupported schema version/)
  })
})

describe('scene CSV import and export', () => {
  it('imports simple guest CSV when record_type is absent', () => {
    const simpleCsv = 'name,group,vip,child,accessibility,notes\nAda VIP,Couple,true,,,\nCiro Child,Kids,,true,,'
    const result = importSceneCsv(simpleCsv)

    expect(result.mode).toBe('simple')
    expect(result.guests).toHaveLength(2)
    expect(result.groups).toEqual([{ id: 'group_couple', name: 'Couple', color: '#0f766e' }, { id: 'group_kids', name: 'Kids', color: '#be123c' }])
    expect(result.scene).toBeUndefined()
  })

  it('round-trips full scene CSV rows with record types and schema versions', () => {
    const scene = makeAssignedScene()
    const csv = exportSceneCsv(scene)
    const result = importSceneCsv(csv)

    expect(csv).toContain('record_type')
    expect(csv).toContain('schema_version')
    expect(result.mode).toBe('roundTrip')
    expect(result.scene).toEqual(canonicalizeScene(scene))
    expect(result.assignments).toEqual(expect.arrayContaining([{ guestId: 'guest_vip', tableId: 'table_main', seatId: 'table_main_top_1' }]))
  })

  it('exports simple guest CSV without round-trip record_type rows', () => {
    const csv = exportSceneCsv(makeAssignedScene(), 'simple')

    expect(csv.split('\n')[0]).not.toContain('record_type')
    expect(csv).toContain('Ada VIP')
  })
})

describe('scene SVG import and export', () => {
  it('imports app-generated SVG metadata as editable scene data', () => {
    const scene = makeAssignedScene()
    const svg = exportSceneSvg(scene)
    const result = importSceneSvg(svg)

    expect(svg).toContain(WEDDING_SEAT_MAP_MIME)
    expect(result.kind).toBe('editable')
    expect(result.scene).toEqual(canonicalizeScene(scene))
  })

  it('imports arbitrary SVG as a locked background object', () => {
    const result = importSceneSvg('<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>')

    expect(result.kind).toBe('background')
    expect(result.background?.type).toBe('backgroundSvg')
    expect(result.background?.width).toBe(320)
    expect(result.background?.height).toBe(180)
    expect(result.background?.locked).toBe(true)
  })

  it('rejects active SVG backgrounds and exports backgrounds as encoded images', () => {
    const maliciousSvgs = [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10" /></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10" /></a></svg>',
    ]

    maliciousSvgs.forEach((svg) => {
      expect(() => importSceneSvg(svg)).toThrow(/Unsafe SVG background import/)
    })

    const background = importSceneSvg(
      '<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>',
    ).background
    expect(background).toBeDefined()

    const exported = exportSceneSvg({
      ...makeAssignedScene(),
      objects: [background!],
    })
    const document = new DOMParser().parseFromString(exported, 'image/svg+xml')
    const image = document.querySelector('g[data-object-id] > image')

    expect(image?.getAttribute('href')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(document.querySelector('g[data-object-id] > svg')).toBeNull()
  })
})

describe('PDF kit export', () => {
  it('generates a non-empty PDF array buffer', () => {
    const output = generatePdfKit(makeAssignedScene(), { output: 'arraybuffer' })

    expect(output).toBeInstanceOf(ArrayBuffer)
    expect(output.byteLength).toBeGreaterThan(500)
  })
})
