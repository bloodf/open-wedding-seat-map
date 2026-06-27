/**
 * Purpose: Persists encrypted collaboration updates while the app is offline
 *          and exposes a small queue API for later Supabase replay.
 *
 * Public API: createOfflineUpdateQueue, PersistentOfflineUpdateQueue,
 *             OfflineUpdateQueue, PendingEncryptedUpdate.
 *
 * Upstream deps: idb openDB when IndexedDB exists, localStorage fallback when
 *                IndexedDB is missing or disabled, encrypted envelope type.
 *
 * Downstream consumers: collaboration sync loop, service worker handoff, tests.
 *
 * Failure modes: IndexedDB open failures fall back to localStorage. If
 *                localStorage is unavailable, an in-memory queue preserves the
 *                runtime session only.
 *
 * Performance: queue reads are sorted in memory and expected to stay small;
 *              future batching can page by createdAt or mapId.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { EncryptedEnvelope } from '../crypto/envelope'

export type OfflineUpdateStatus = 'pending' | 'failed'

export interface PendingEncryptedUpdate {
  id: string
  mapId: string
  sessionId?: string
  encryptedUpdate: EncryptedEnvelope
  createdAt: string
  attemptCount: number
  status: OfflineUpdateStatus
  lastError?: string
}

export interface EnqueueEncryptedUpdateInput {
  id?: string
  mapId: string
  sessionId?: string
  encryptedUpdate: EncryptedEnvelope
}

export interface OfflineUpdateQueue {
  enqueue(input: EnqueueEncryptedUpdateInput): Promise<PendingEncryptedUpdate>
  listPending(mapId?: string): Promise<PendingEncryptedUpdate[]>
  markSynced(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  clearMap(mapId: string): Promise<void>
  size(mapId?: string): Promise<number>
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface OfflineUpdateQueueOptions {
  namespace?: string
  preferIndexedDb?: boolean
  storage?: StorageLike
  now?: () => string
}

interface OfflineQueueDb extends DBSchema {
  pendingUpdates: {
    key: string
    value: PendingEncryptedUpdate
    indexes: {
      'by-map': string
      'by-created': string
    }
  }
}

const DEFAULT_NAMESPACE = 'wedding-seat-map'
const DB_VERSION = 1

export function createOfflineUpdateQueue(
  options: OfflineUpdateQueueOptions = {},
): OfflineUpdateQueue {
  return new PersistentOfflineUpdateQueue(options)
}

export class PersistentOfflineUpdateQueue implements OfflineUpdateQueue {
  private readonly namespace: string
  private readonly preferIndexedDb: boolean
  private readonly storage: StorageLike
  private readonly now: () => string
  private dbPromise: Promise<IDBPDatabase<OfflineQueueDb>> | null = null

  constructor(options: OfflineUpdateQueueOptions = {}) {
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE
    this.preferIndexedDb = options.preferIndexedDb ?? true
    this.storage = options.storage ?? getDefaultStorage()
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async enqueue(input: EnqueueEncryptedUpdateInput): Promise<PendingEncryptedUpdate> {
    const record: PendingEncryptedUpdate = {
      id: input.id ?? createUpdateId(),
      mapId: input.mapId,
      sessionId: input.sessionId,
      encryptedUpdate: input.encryptedUpdate,
      createdAt: this.now(),
      attemptCount: 0,
      status: 'pending',
    }

    if (this.shouldUseIndexedDb()) {
      try {
        const db = await this.openDb()
        await db.put('pendingUpdates', record)
        return record
      } catch {
        this.prependStorageRecord(record)
        return record
      }
    }

    this.prependStorageRecord(record)
    return record
  }

  async listPending(mapId?: string): Promise<PendingEncryptedUpdate[]> {
    if (this.shouldUseIndexedDb()) {
      try {
        const db = await this.openDb()
        const records = mapId
          ? await db.getAllFromIndex('pendingUpdates', 'by-map', mapId)
          : await db.getAll('pendingUpdates')
        return sortByCreatedAt(records)
      } catch {
        return this.listStorageRecords(mapId)
      }
    }

    return this.listStorageRecords(mapId)
  }

  async markSynced(id: string): Promise<void> {
    if (this.shouldUseIndexedDb()) {
      try {
        const db = await this.openDb()
        await db.delete('pendingUpdates', id)
        return
      } catch {
        this.deleteStorageRecord(id)
        return
      }
    }

    this.deleteStorageRecord(id)
  }

  async markFailed(id: string, error: string): Promise<void> {
    if (this.shouldUseIndexedDb()) {
      try {
        const db = await this.openDb()
        const record = await db.get('pendingUpdates', id)
        if (record) {
          await db.put('pendingUpdates', toFailedRecord(record, error))
        }
        return
      } catch {
        this.updateStorageRecord(id, (record) => toFailedRecord(record, error))
        return
      }
    }

    this.updateStorageRecord(id, (record) => toFailedRecord(record, error))
  }

  async clearMap(mapId: string): Promise<void> {
    const records = await this.listPending(mapId)

    await Promise.all(records.map((record) => this.markSynced(record.id)))
  }

  async size(mapId?: string): Promise<number> {
    return (await this.listPending(mapId)).length
  }

  private shouldUseIndexedDb(): boolean {
    return this.preferIndexedDb && typeof globalThis.indexedDB !== 'undefined'
  }

  private openDb(): Promise<IDBPDatabase<OfflineQueueDb>> {
    this.dbPromise ??= openDB<OfflineQueueDb>(`${this.namespace}-offline-queue`, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingUpdates')) {
          const store = db.createObjectStore('pendingUpdates', { keyPath: 'id' })
          store.createIndex('by-map', 'mapId')
          store.createIndex('by-created', 'createdAt')
        }
      },
    })

    return this.dbPromise
  }

  private prependStorageRecord(record: PendingEncryptedUpdate): void {
    const records = this.readStorageRecords().filter((item) => item.id !== record.id)
    records.push(record)
    this.writeStorageRecords(records)
  }

  private listStorageRecords(mapId?: string): PendingEncryptedUpdate[] {
    const records = this.readStorageRecords()
    return sortByCreatedAt(mapId ? records.filter((record) => record.mapId === mapId) : records)
  }

  private deleteStorageRecord(id: string): void {
    this.writeStorageRecords(this.readStorageRecords().filter((record) => record.id !== id))
  }

  private updateStorageRecord(
    id: string,
    updater: (record: PendingEncryptedUpdate) => PendingEncryptedUpdate,
  ): void {
    this.writeStorageRecords(
      this.readStorageRecords().map((record) => (record.id === id ? updater(record) : record)),
    )
  }

  private readStorageRecords(): PendingEncryptedUpdate[] {
    const raw = this.storage.getItem(this.storageKey)
    if (!raw) {
      return []
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isPendingEncryptedUpdate) : []
    } catch {
      return []
    }
  }

  private writeStorageRecords(records: PendingEncryptedUpdate[]): void {
    if (records.length === 0) {
      this.storage.removeItem(this.storageKey)
      return
    }

    this.storage.setItem(this.storageKey, JSON.stringify(records))
  }

  private get storageKey(): string {
    return `${this.namespace}:pending-encrypted-updates`
  }
}

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

function getDefaultStorage(): StorageLike {
  try {
    if (globalThis.localStorage) {
      return globalThis.localStorage
    }
  } catch {
    return new MemoryStorage()
  }

  return new MemoryStorage()
}

function toFailedRecord(record: PendingEncryptedUpdate, error: string): PendingEncryptedUpdate {
  return {
    ...record,
    status: 'failed',
    attemptCount: record.attemptCount + 1,
    lastError: error,
  }
}

function sortByCreatedAt(records: PendingEncryptedUpdate[]): PendingEncryptedUpdate[] {
  return [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function createUpdateId(): string {
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    : Math.random().toString(36).slice(2)

  return `${Date.now().toString(36)}-${random}`
}

function isPendingEncryptedUpdate(value: unknown): value is PendingEncryptedUpdate {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.mapId === 'string' &&
    isRecord(value.encryptedUpdate) &&
    typeof value.createdAt === 'string' &&
    typeof value.attemptCount === 'number' &&
    (value.status === 'pending' || value.status === 'failed')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
