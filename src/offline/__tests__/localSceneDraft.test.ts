import { createDefaultScene } from '../../domain/scene'
import { LOCAL_SCENE_DRAFT_KEY, clearLocalSceneDraft, loadLocalSceneDraft, saveLocalSceneDraft } from '../localSceneDraft'
import type { StorageLike } from '../updateQueue'

describe('local scene draft storage', () => {
  it('saves, loads, and clears a validated local scene draft', () => {
    const storage = new MemoryStorage()
    const scene = createDefaultScene('en')

    expect(saveLocalSceneDraft(scene, storage)).toBe(true)
    expect(storage.getItem(LOCAL_SCENE_DRAFT_KEY)).toContain('"schemaVersion": 1')
    expect(loadLocalSceneDraft(storage)?.id).toBe(scene.id)

    expect(clearLocalSceneDraft(storage)).toBe(true)
    expect(loadLocalSceneDraft(storage)).toBeNull()
  })

  it('ignores malformed stored drafts', () => {
    const storage = new MemoryStorage()
    storage.setItem(LOCAL_SCENE_DRAFT_KEY, '{"schemaVersion":2}')

    expect(loadLocalSceneDraft(storage)).toBeNull()
  })
})

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}
