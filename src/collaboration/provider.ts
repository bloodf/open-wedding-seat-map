/**
 * Purpose: Defines the collaboration provider boundary and Supabase Realtime
 *          adapter used to exchange encrypted document updates and presence.
 *
 * Public API: CollaborationProvider, SupabaseRealtimeCollaborationProvider,
 *             LocalCollaborationProvider, createCollaborationProvider.
 *
 * Upstream deps: @supabase/supabase-js runtime, encrypted envelope types,
 *                Supabase Realtime broadcast/presence/postgres_changes APIs.
 *
 * Downstream consumers: future Yjs binding and editor collaboration layer.
 *
 * Failure modes: remote providers throw on failed RPC, failed broadcast, or
 *                private channel subscription errors. Local fallback is
 *                in-memory only and does not sync across browser tabs.
 *
 * Performance: realtime broadcast is low-latency; persisted catch-up reads are
 *              ordered by map update id and can be paginated by callers later.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { isEncryptedEnvelope, type EncryptedEnvelope } from '../crypto/envelope'
import {
  getSupabaseRuntime,
  isSupabaseRemoteRuntime,
  type SupabaseRuntime,
} from '../services/supabase/client'
import type { CapabilityRole } from '../services/supabase/capabilityLinks'

export type Unsubscribe = () => void
export type CollaborationStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface PresenceState {
  sessionId: string
  role: CapabilityRole
  displayName?: string
  selectedObjectIds?: string[]
  cursor?: {
    x: number
    y: number
  }
  onlineAt: string
}

export interface RealtimeCollaborationUpdate {
  mapId: string
  sessionId: string
  encryptedUpdate: EncryptedEnvelope
  updateId?: number
  createdAt: string
}

export interface PersistedCollaborationUpdate extends RealtimeCollaborationUpdate {
  updateId: number
}

export interface CollaborationProvider {
  readonly mode: 'remote' | 'local'
  readonly mapId: string
  readonly sessionId: string
  readonly status: CollaborationStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  broadcastUpdate(encryptedUpdate: EncryptedEnvelope): Promise<void>
  persistUpdate(encryptedUpdate: EncryptedEnvelope): Promise<number | null>
  catchUp(afterUpdateId?: number): Promise<PersistedCollaborationUpdate[]>
  trackPresence(state: PresenceState): Promise<void>
  onUpdate(listener: (update: RealtimeCollaborationUpdate) => void): Unsubscribe
  onPresence(listener: (states: PresenceState[]) => void): Unsubscribe
}

export interface CollaborationProviderOptions {
  mapId: string
  sessionId: string
  role: CapabilityRole
  runtime?: SupabaseRuntime
  topic?: string
}

type SupabaseChannel = ReturnType<SupabaseClient['channel']>

const REALTIME_UPDATE_EVENT = 'encrypted-update'
const CHANNEL_TIMEOUT_MS = 10_000

export function createCollaborationProvider(
  options: CollaborationProviderOptions,
): CollaborationProvider {
  const runtime = options.runtime ?? getSupabaseRuntime()

  if (isSupabaseRemoteRuntime(runtime)) {
    return new SupabaseRealtimeCollaborationProvider({ ...options, runtime })
  }

  return new LocalCollaborationProvider(options)
}

export class SupabaseRealtimeCollaborationProvider implements CollaborationProvider {
  readonly mode = 'remote'
  readonly mapId: string
  readonly sessionId: string

  private readonly role: CapabilityRole
  private readonly runtime: Extract<SupabaseRuntime, { mode: 'remote' }>
  private readonly topic: string
  private readonly updateListeners = new Set<(update: RealtimeCollaborationUpdate) => void>()
  private readonly presenceListeners = new Set<(states: PresenceState[]) => void>()
  private channel: SupabaseChannel | null = null
  private currentStatus: CollaborationStatus = 'idle'

  constructor(options: CollaborationProviderOptions & { runtime: Extract<SupabaseRuntime, { mode: 'remote' }> }) {
    this.mapId = options.mapId
    this.sessionId = options.sessionId
    this.role = options.role
    this.runtime = options.runtime
    this.topic = options.topic ?? `map:${options.mapId}`
  }

  get status(): CollaborationStatus {
    return this.currentStatus
  }

  async connect(): Promise<void> {
    if (this.channel && this.currentStatus === 'connected') {
      return
    }

    this.currentStatus = 'connecting'
    const channel = this.runtime.client.channel(this.topic, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: this.sessionId },
      },
    })

    channel
      .on('broadcast', { event: REALTIME_UPDATE_EVENT }, (message: { payload: unknown }) => {
        const update = parseRealtimeUpdate(message.payload, this.mapId)
        if (update) {
          this.emitUpdate(update)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        this.emitPresence(flattenPresenceState(state))
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'map_updates',
          filter: `map_id=eq.${this.mapId}`,
        },
        (payload: { new: unknown }) => {
          const update = parsePersistedUpdate(payload.new, this.mapId)
          if (update) {
            this.emitUpdate(update)
          }
        },
      )

    await new Promise<void>((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        this.currentStatus = 'disconnected'
        reject(new Error('Timed out connecting to Supabase Realtime'))
      }, CHANNEL_TIMEOUT_MS)

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          globalThis.clearTimeout(timeoutId)
          this.channel = channel
          this.currentStatus = 'connected'
          resolve()
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          globalThis.clearTimeout(timeoutId)
          this.currentStatus = 'disconnected'
          reject(new Error(`Supabase Realtime channel failed with status ${status}`))
        }
      })
    })

    await this.trackPresence({
      sessionId: this.sessionId,
      role: this.role,
      onlineAt: new Date().toISOString(),
    })
  }

  async disconnect(): Promise<void> {
    if (!this.channel) {
      this.currentStatus = 'disconnected'
      return
    }

    const channel = this.channel
    this.channel = null
    await this.runtime.client.removeChannel(channel)
    this.currentStatus = 'disconnected'
  }

  async broadcastUpdate(encryptedUpdate: EncryptedEnvelope): Promise<void> {
    await this.ensureConnected()
    const payload = this.createRealtimeUpdate(encryptedUpdate)
    const response = await this.channel?.send({
      type: 'broadcast',
      event: REALTIME_UPDATE_EVENT,
      payload,
    })

    if (response !== 'ok') {
      throw new Error(`Supabase Realtime broadcast failed with response ${String(response)}`)
    }
  }

  async persistUpdate(encryptedUpdate: EncryptedEnvelope): Promise<number | null> {
    const { data, error } = await this.runtime.client.rpc('append_map_update_via_session', {
      p_session_id: this.sessionId,
      p_encrypted_update: encryptedUpdate,
    })

    if (error) {
      throw error
    }

    return typeof data === 'number' ? data : null
  }

  async catchUp(afterUpdateId = 0): Promise<PersistedCollaborationUpdate[]> {
    const { data, error } = await this.runtime.client.rpc('list_map_updates_via_session', {
      p_session_id: this.sessionId,
      p_after_update_id: afterUpdateId,
    })

    if (error) {
      throw error
    }

    return parsePersistedUpdates(data, this.mapId)
  }

  async trackPresence(state: PresenceState): Promise<void> {
    await this.ensureConnected()
    await this.channel?.track(state)
  }

  onUpdate(listener: (update: RealtimeCollaborationUpdate) => void): Unsubscribe {
    this.updateListeners.add(listener)
    return () => this.updateListeners.delete(listener)
  }

  onPresence(listener: (states: PresenceState[]) => void): Unsubscribe {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  private async ensureConnected(): Promise<void> {
    if (!this.channel || this.currentStatus !== 'connected') {
      await this.connect()
    }
  }

  private createRealtimeUpdate(encryptedUpdate: EncryptedEnvelope): RealtimeCollaborationUpdate {
    return {
      mapId: this.mapId,
      sessionId: this.sessionId,
      encryptedUpdate,
      createdAt: new Date().toISOString(),
    }
  }

  private emitUpdate(update: RealtimeCollaborationUpdate): void {
    for (const listener of this.updateListeners) {
      listener(update)
    }
  }

  private emitPresence(states: PresenceState[]): void {
    for (const listener of this.presenceListeners) {
      listener(states)
    }
  }
}

export class LocalCollaborationProvider implements CollaborationProvider {
  readonly mode = 'local'
  readonly mapId: string
  readonly sessionId: string

  private readonly role: CapabilityRole
  private readonly hub: LocalCollaborationHub
  private currentStatus: CollaborationStatus = 'idle'

  constructor(options: CollaborationProviderOptions) {
    this.mapId = options.mapId
    this.sessionId = options.sessionId
    this.role = options.role
    this.hub = getLocalHub(options.topic ?? `map:${options.mapId}`)
  }

  get status(): CollaborationStatus {
    return this.currentStatus
  }

  async connect(): Promise<void> {
    this.currentStatus = 'connected'
    await this.trackPresence({
      sessionId: this.sessionId,
      role: this.role,
      onlineAt: new Date().toISOString(),
    })
  }

  async disconnect(): Promise<void> {
    this.hub.presence.delete(this.sessionId)
    this.currentStatus = 'disconnected'
    this.hub.emitPresence()
  }

  async broadcastUpdate(encryptedUpdate: EncryptedEnvelope): Promise<void> {
    this.hub.emitUpdate({
      mapId: this.mapId,
      sessionId: this.sessionId,
      encryptedUpdate,
      createdAt: new Date().toISOString(),
    })
  }

  async persistUpdate(encryptedUpdate: EncryptedEnvelope): Promise<number | null> {
    await this.broadcastUpdate(encryptedUpdate)
    return null
  }

  async catchUp(): Promise<PersistedCollaborationUpdate[]> {
    return []
  }

  async trackPresence(state: PresenceState): Promise<void> {
    this.hub.presence.set(this.sessionId, state)
    this.hub.emitPresence()
  }

  onUpdate(listener: (update: RealtimeCollaborationUpdate) => void): Unsubscribe {
    this.hub.updateListeners.add(listener)
    return () => this.hub.updateListeners.delete(listener)
  }

  onPresence(listener: (states: PresenceState[]) => void): Unsubscribe {
    this.hub.presenceListeners.add(listener)
    return () => this.hub.presenceListeners.delete(listener)
  }
}

class LocalCollaborationHub {
  readonly updateListeners = new Set<(update: RealtimeCollaborationUpdate) => void>()
  readonly presenceListeners = new Set<(states: PresenceState[]) => void>()
  readonly presence = new Map<string, PresenceState>()

  emitUpdate(update: RealtimeCollaborationUpdate): void {
    for (const listener of this.updateListeners) {
      listener(update)
    }
  }

  emitPresence(): void {
    const states = Array.from(this.presence.values())
    for (const listener of this.presenceListeners) {
      listener(states)
    }
  }
}

const localHubs = new Map<string, LocalCollaborationHub>()

function getLocalHub(topic: string): LocalCollaborationHub {
  let hub = localHubs.get(topic)

  if (!hub) {
    hub = new LocalCollaborationHub()
    localHubs.set(topic, hub)
  }

  return hub
}

function parseRealtimeUpdate(
  payload: unknown,
  expectedMapId: string,
): RealtimeCollaborationUpdate | null {
  if (!isRecord(payload) || payload.mapId !== expectedMapId || !isEncryptedEnvelope(payload.encryptedUpdate)) {
    return null
  }

  return {
    mapId: expectedMapId,
    sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : 'unknown',
    encryptedUpdate: payload.encryptedUpdate,
    updateId: typeof payload.updateId === 'number' ? payload.updateId : undefined,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
  }
}

function parsePersistedUpdates(
  payload: unknown,
  mapId: string,
): PersistedCollaborationUpdate[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((value) => parsePersistedUpdate(value, mapId))
    .filter((value): value is PersistedCollaborationUpdate => value !== null)
}

function parsePersistedUpdate(
  payload: unknown,
  mapId: string,
): PersistedCollaborationUpdate | null {
  if (!isRecord(payload)) {
    return null
  }

  const updateId = getNumericField(payload, 'update_id') ?? getNumericField(payload, 'id')
  const encryptedUpdate = payload.encrypted_update
  const createdAt = getStringField(payload, 'created_at') ?? new Date().toISOString()

  if (updateId === null || !isEncryptedEnvelope(encryptedUpdate)) {
    return null
  }

  return {
    mapId,
    sessionId: getStringField(payload, 'update_session_id') ?? getStringField(payload, 'session_id') ?? 'unknown',
    encryptedUpdate,
    updateId,
    createdAt,
  }
}

function flattenPresenceState(state: Record<string, PresenceState[]>): PresenceState[] {
  return Object.values(state).flat()
}

function getStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  return typeof value === 'string' ? value : null
}

function getNumericField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field]
  return typeof value === 'number' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
