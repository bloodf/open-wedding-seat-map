/**
 * Purpose: Saves and loads the latest editable scene draft in browser storage
 *          so the greenfield editor survives refreshes without Supabase.
 *
 * Public API: LOCAL_SCENE_DRAFT_KEY, loadLocalSceneDraft, saveLocalSceneDraft,
 *             clearLocalSceneDraft.
 *
 * Upstream deps: JSON scene import/export validators and StorageLike from the
 *                offline queue fallback contract.
 *
 * Downstream consumers: App autosave bootstrap and local-flow tests.
 *
 * Failure modes: invalid stored JSON, schema drift, storage quota errors, and
 *                unavailable localStorage all resolve to null/false instead of
 *                blocking editor startup. Safe to retry on every scene change.
 *
 * Performance: O(scene size) synchronous localStorage access for editor-scale
 *              drafts.
 */

import { exportSceneJson, importSceneJson } from '../io/json'
import type { Scene } from '../domain/types'
import type { StorageLike } from './updateQueue'

export const LOCAL_SCENE_DRAFT_KEY = 'wedding-seat-map:scene-draft'

export function loadLocalSceneDraft(storage: StorageLike | null = getBrowserStorage()): Scene | null {
  if (!storage) return null

  try {
    const raw = storage.getItem(LOCAL_SCENE_DRAFT_KEY)
    return raw ? importSceneJson(raw).scene : null
  } catch {
    return null
  }
}

export function saveLocalSceneDraft(scene: Scene, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false

  try {
    storage.setItem(LOCAL_SCENE_DRAFT_KEY, exportSceneJson(scene))
    return true
  } catch {
    return false
  }
}

export function clearLocalSceneDraft(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false

  try {
    storage.removeItem(LOCAL_SCENE_DRAFT_KEY)
    return true
  } catch {
    return false
  }
}

function getBrowserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
