/**
 * Purpose: Reads and writes the canonical plaintext JSON format for editable
 *          Wedding Seat Map scene documents.
 *
 * Public API: exportSceneJson(scene), importSceneJson(text).
 *
 * Upstream deps: schema validation and canonical domain types.
 *
 * Downstream consumers: file import/export UI, SVG metadata IO, CSV full import,
 *                       persistence migrations, tests.
 *
 * Failure modes: throws SceneSchemaError when JSON is invalid, unsupported, or
 *                missing required scene fields. No side effects; safe to retry.
 *
 * Performance: O(scene size) parse/stringify.
 */

import type { Scene } from '../domain/types'
import { canonicalizeScene, SceneSchemaError, validateSceneDocument } from './schema'

export interface JsonImportResult {
  scene: Scene
  warnings: string[]
}

export function exportSceneJson(scene: Scene): string {
  return `${JSON.stringify(canonicalizeScene(scene), null, 2)}\n`
}

export function importSceneJson(text: string): JsonImportResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new SceneSchemaError(error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON.')
  }

  return validateSceneDocument(parsed)
}
