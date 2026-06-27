/**
 * Purpose: Creates the Supabase runtime for Wedding Seat Map while allowing
 *          local-first operation when credentials are not configured.
 *
 * Public API: createSupabaseRuntime, getSupabaseRuntime, getSupabaseClient,
 *             isSupabaseRemoteRuntime, resolveSupabaseConfig.
 *
 * Upstream deps: @supabase/supabase-js and Vite import.meta.env.
 *
 * Downstream consumers: collaboration provider, capability/session services,
 *                       future app bootstrap.
 *
 * Failure modes: returns a local runtime instead of throwing when
 *                VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is absent.
 *
 * Performance: singleton creation is cheap; Supabase manages network pooling.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export interface LocalSupabaseRuntime {
  mode: 'local'
  client: null
  reason: string
}

export interface RemoteSupabaseRuntime {
  mode: 'remote'
  client: SupabaseClient
  config: SupabaseConfig
}

export type SupabaseRuntime = LocalSupabaseRuntime | RemoteSupabaseRuntime

type SupabaseEnv = Partial<
  Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY', string | boolean | undefined>
>

let runtimeSingleton: SupabaseRuntime | null = null

export function resolveSupabaseConfig(env: SupabaseEnv = import.meta.env): SupabaseConfig | null {
  const url = normalizeEnvValue(env.VITE_SUPABASE_URL)
  const anonKey = normalizeEnvValue(env.VITE_SUPABASE_ANON_KEY)

  if (!url || !anonKey) {
    return null
  }

  return { url, anonKey }
}

export function createSupabaseRuntime(env: SupabaseEnv = import.meta.env): SupabaseRuntime {
  const config = resolveSupabaseConfig(env)

  if (!config) {
    return {
      mode: 'local',
      client: null,
      reason: 'Supabase environment variables are not configured',
    }
  }

  return {
    mode: 'remote',
    config,
    client: createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    }),
  }
}

export function getSupabaseRuntime(): SupabaseRuntime {
  runtimeSingleton ??= createSupabaseRuntime()
  return runtimeSingleton
}

export function getSupabaseClient(): SupabaseClient | null {
  const runtime = getSupabaseRuntime()
  return runtime.mode === 'remote' ? runtime.client : null
}

export function isSupabaseRemoteRuntime(runtime: SupabaseRuntime): runtime is RemoteSupabaseRuntime {
  return runtime.mode === 'remote'
}

function normalizeEnvValue(value: string | boolean | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}
