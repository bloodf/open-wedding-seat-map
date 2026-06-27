import type { EncryptedEnvelope } from '../../crypto/envelope'
import { createOfflineUpdateQueue, type StorageLike } from '../updateQueue'

describe('offline update queue', () => {
  it('enqueues and lists encrypted updates without IndexedDB', async () => {
    const storage = new TestStorage()
    const queue = createOfflineUpdateQueue({
      namespace: 'queue-basic',
      preferIndexedDb: false,
      storage,
      now: createClock('2026-06-27T10:00:00.000Z'),
    })

    const record = await queue.enqueue({
      id: 'update-1',
      mapId: 'map-1',
      sessionId: 'session-1',
      encryptedUpdate: envelope('first'),
    })

    expect(record).toMatchObject({
      id: 'update-1',
      mapId: 'map-1',
      sessionId: 'session-1',
      attemptCount: 0,
      status: 'pending',
    })
    await expect(queue.listPending('map-1')).resolves.toHaveLength(1)
    await expect(queue.size()).resolves.toBe(1)
  })

  it('marks failures and removes synced records', async () => {
    const storage = new TestStorage()
    const queue = createOfflineUpdateQueue({
      namespace: 'queue-failure',
      preferIndexedDb: false,
      storage,
      now: createClock('2026-06-27T10:05:00.000Z'),
    })

    await queue.enqueue({
      id: 'update-2',
      mapId: 'map-2',
      encryptedUpdate: envelope('second'),
    })

    await queue.markFailed('update-2', 'network unavailable')

    const [failed] = await queue.listPending('map-2')
    expect(failed).toMatchObject({
      id: 'update-2',
      status: 'failed',
      attemptCount: 1,
      lastError: 'network unavailable',
    })

    await queue.markSynced('update-2')

    await expect(queue.listPending('map-2')).resolves.toEqual([])
  })

  it('clears only records for the requested map', async () => {
    const storage = new TestStorage()
    const queue = createOfflineUpdateQueue({
      namespace: 'queue-clear',
      preferIndexedDb: false,
      storage,
    })

    await queue.enqueue({ id: 'a', mapId: 'map-a', encryptedUpdate: envelope('a') })
    await queue.enqueue({ id: 'b', mapId: 'map-b', encryptedUpdate: envelope('b') })

    await queue.clearMap('map-a')

    expect((await queue.listPending()).map((record) => record.id)).toEqual(['b'])
  })
})

class TestStorage implements StorageLike {
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

function envelope(ciphertext: string): EncryptedEnvelope {
  return {
    version: 1,
    alg: 'AES-GCM',
    encoding: 'bytes',
    iv: 'iv',
    ciphertext,
  }
}

function createClock(start: string): () => string {
  let tick = 0
  const startTime = Date.parse(start)

  return () => {
    const value = new Date(startTime + tick).toISOString()
    tick += 1
    return value
  }
}
