/**
 * Purpose: Exports editable scene SVGs with embedded Wedding Seat Map metadata
 *          and imports SVGs as either editable scenes or background objects.
 *
 * Public API: exportSceneSvg(scene), importSceneSvg(svg).
 *
 * Upstream deps: JSON scene codec, canonical metadata MIME, domain ID helpers,
 *                and canonical domain types.
 *
 * Downstream consumers: SVG file import/export UI, persistence tests, PDF map
 *                       rendering as a human-readable fallback.
 *
 * Failure modes: editable metadata import throws SceneSchemaError via JSON
 *                validation; arbitrary SVG import rejects active content before
 *                returning a locked background object.
 *
 * Performance: O(scene size + SVG size) in memory.
 */

import { makeId } from '../domain/ids'
import type { AreaObject, BackgroundSvgObject, Scene, SceneObject, TableObject } from '../domain/types'
import { exportSceneJson, importSceneJson } from './json'
import { WEDDING_SEAT_MAP_MIME } from './schema'

const METADATA_SELECTOR = `script[type="${WEDDING_SEAT_MAP_MIME}"]`
const ACTIVE_SVG_ELEMENTS = new Set([
  'audio',
  'canvas',
  'embed',
  'foreignobject',
  'iframe',
  'link',
  'object',
  'script',
  'style',
  'video',
])
const URI_ATTRIBUTE_NAMES = new Set(['action', 'formaction', 'href', 'poster', 'src', 'xlink:href'])
const ACTIVE_URL_PATTERN = /(?:java|vb)script:|data:(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)/iu

export interface SvgImportResult {
  kind: 'editable' | 'background'
  scene?: Scene
  background?: BackgroundSvgObject
}

export class SvgImportSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SvgImportSecurityError'
  }
}

export function exportSceneSvg(scene: Scene): string {
  const metadata = createMetadata(scene)
  const body = scene.objects.map(renderObject).join('\n  ')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.canvas.width}" height="${scene.canvas.height}" viewBox="0 0 ${scene.canvas.width} ${scene.canvas.height}" role="img">`,
    `  <title>${escapeXml(scene.name)}</title>`,
    `  ${metadata}`,
    `  <rect x="0" y="0" width="${scene.canvas.width}" height="${scene.canvas.height}" fill="#ffffff" />`,
    `  ${body}`,
    '</svg>',
    '',
  ].join('\n')
}

export function importSceneSvg(svg: string): SvgImportResult {
  const metadata = readMetadata(svg)

  if (metadata) {
    return {
      kind: 'editable',
      scene: importSceneJson(metadata).scene,
    }
  }

  return {
    kind: 'background',
    background: createBackgroundSvgObject(svg),
  }
}

function createMetadata(scene: Scene): string {
  const json = exportSceneJson(scene).replaceAll(']]>', ']]]]><![CDATA[>')

  return [
    `<metadata id="wedding-seat-map-metadata" data-mime="${WEDDING_SEAT_MAP_MIME}">`,
    `    <script type="${WEDDING_SEAT_MAP_MIME}"><![CDATA[${json}]]></script>`,
    '  </metadata>',
  ].join('\n')
}

function readMetadata(svg: string): string | undefined {
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const metadataElement = document.querySelector(METADATA_SELECTOR)
    const content = metadataElement?.textContent?.trim()

    if (content) return content
  }

  const escapedMime = WEDDING_SEAT_MAP_MIME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = svg.match(new RegExp(`<script[^>]+type=["']${escapedMime}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'))
  const content = match?.[1]?.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()

  return content || undefined
}

function createBackgroundSvgObject(svg: string): BackgroundSvgObject {
  const sanitizedSvg = sanitizeBackgroundSvg(svg)
  const size = readSvgSize(sanitizedSvg)

  return {
    id: makeId('svg'),
    type: 'backgroundSvg',
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    rotation: 0,
    label: 'Imported SVG',
    locked: true,
    svg: sanitizedSvg,
  }
}

function sanitizeBackgroundSvg(svg: string): string {
  const trimmedSvg = svg.trim()

  if (!trimmedSvg) {
    throw new SvgImportSecurityError('Unsafe SVG background import: SVG is empty.')
  }

  if (typeof DOMParser === 'undefined') {
    rejectUnsafeSvgSource(trimmedSvg)
    return trimmedSvg
  }

  const document = new DOMParser().parseFromString(trimmedSvg, 'image/svg+xml')
  const root = document.documentElement

  if (document.querySelector('parsererror') || root.localName.toLowerCase() !== 'svg') {
    throw new SvgImportSecurityError('Unsafe SVG background import: invalid SVG document.')
  }

  rejectUnsafeSvgDocument(root)

  return typeof XMLSerializer === 'undefined' ? trimmedSvg : new XMLSerializer().serializeToString(root)
}

function rejectUnsafeSvgDocument(root: Element): void {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))]

  elements.forEach((element) => {
    const tagName = element.localName.toLowerCase()

    if (ACTIVE_SVG_ELEMENTS.has(tagName)) {
      throw new SvgImportSecurityError(`Unsafe SVG background import: <${tagName}> is not allowed.`)
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value

      if (name.startsWith('on') || name === 'srcdoc') {
        throw new SvgImportSecurityError(`Unsafe SVG background import: ${attribute.name} is not allowed.`)
      }

      if (name === 'style' && hasActiveSvgUrl(value)) {
        throw new SvgImportSecurityError('Unsafe SVG background import: active style URL is not allowed.')
      }

      if (URI_ATTRIBUTE_NAMES.has(name) && hasActiveSvgUrl(value)) {
        throw new SvgImportSecurityError(`Unsafe SVG background import: active ${attribute.name} URL is not allowed.`)
      }
    })
  })
}

function rejectUnsafeSvgSource(svg: string): void {
  if (/<\s*(?:audio|canvas|embed|foreignObject|iframe|link|object|script|style|video)\b/iu.test(svg)) {
    throw new SvgImportSecurityError('Unsafe SVG background import: active SVG element is not allowed.')
  }

  if (/\s+on[a-z]+\s*=/iu.test(svg) || /\s+srcdoc\s*=/iu.test(svg) || hasActiveSvgUrl(svg)) {
    throw new SvgImportSecurityError('Unsafe SVG background import: active SVG attribute is not allowed.')
  }
}

function hasActiveSvgUrl(value: string): boolean {
  const normalized = normalizePotentialUrl(value)
  return ACTIVE_URL_PATTERN.test(normalized) || normalized.includes('@import')
}

function normalizePotentialUrl(value: string): string {
  let normalized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f && !/\s/u.test(character)
    })
    .join('')

  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(normalized)
      if (decoded === normalized) break
      normalized = decoded
    } catch {
      break
    }
  }

  return normalized.toLowerCase()
}

function readSvgSize(svg: string): { width: number; height: number } {
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = document.documentElement
    const width = parseDimension(root.getAttribute('width'))
    const height = parseDimension(root.getAttribute('height'))

    if (width && height) return { width, height }

    const viewBox = root.getAttribute('viewBox')?.split(/\s+/).map(Number)
    if (viewBox?.length === 4 && Number.isFinite(viewBox[2]) && Number.isFinite(viewBox[3])) {
      return { width: viewBox[2], height: viewBox[3] }
    }
  }

  return { width: 800, height: 600 }
}

function renderObject(object: SceneObject): string {
  if (object.type === 'table') return renderTable(object)
  if (object.type === 'label') return renderLabel(object)
  if (object.type === 'wall' || object.type === 'line' || object.type === 'door') return renderLine(object)
  if (object.type === 'backgroundSvg') return renderBackgroundSvg(object)
  return renderArea(object as AreaObject)
}

function renderTable(table: TableObject): string {
  const label = table.tableName || table.label
  const common = `stroke="${escapeXml(table.stroke ?? '#0f766e')}" fill="${escapeXml(table.fill ?? '#ffffff')}" transform="${transform(table)}"`
  const shape =
    table.shape === 'round'
      ? `<ellipse cx="${table.x + table.width / 2}" cy="${table.y + table.height / 2}" rx="${table.width / 2}" ry="${table.height / 2}" ${common} />`
      : `<rect x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" rx="6" ${common} />`

  return `<g data-object-id="${escapeXml(table.id)}">${shape}<text x="${table.x + table.width / 2}" y="${table.y + table.height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="#0f172a">${escapeXml(label)}</text></g>`
}

function renderLabel(object: Extract<SceneObject, { type: 'label' }>): string {
  return `<text x="${object.x}" y="${object.y + object.fontSize}" font-size="${object.fontSize}" fill="${escapeXml(object.fill ?? '#111827')}" transform="${transform(object)}">${escapeXml(object.text)}</text>`
}

function renderLine(object: Extract<SceneObject, { type: 'wall' | 'line' | 'door' }>): string {
  return `<line x1="${object.x}" y1="${object.y}" x2="${object.x2}" y2="${object.y2}" stroke="${escapeXml(object.stroke ?? '#475569')}" stroke-width="${object.type === 'door' ? 5 : 4}" stroke-linecap="round" />`
}

function renderBackgroundSvg(object: BackgroundSvgObject): string {
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(object.svg)}`

  return `<g data-object-id="${escapeXml(object.id)}" transform="translate(${object.x} ${object.y})"><image href="${escapeXml(href)}" width="${object.width}" height="${object.height}" preserveAspectRatio="xMidYMid meet" /></g>`
}

function renderArea(object: Exclude<SceneObject, TableObject | BackgroundSvgObject | Extract<SceneObject, { type: 'label' | 'wall' | 'line' | 'door' }>>): string {
  return `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" rx="6" fill="${escapeXml(object.fill ?? '#f8fafc')}" stroke="${escapeXml(object.stroke ?? '#94a3b8')}" transform="${transform(object)}" />`
}

function transform(object: Pick<SceneObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>): string {
  const centerX = object.x + object.width / 2
  const centerY = object.y + object.height / 2
  return `rotate(${object.rotation} ${centerX} ${centerY})`
}

function parseDimension(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
