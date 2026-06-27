/**
 * Purpose: Exposes the auto-seating solver through a dedicated worker message
 *          contract while keeping the same helper callable in tests.
 *
 * Public API: AutoSeatingWorkerRequest, AutoSeatingWorkerResponse,
 *             runAutoSeatingWorkerRequest(request).
 *
 * Upstream deps: autoSeating helper and canonical domain types.
 *
 * Downstream consumers: future editor worker integration and unit tests.
 *
 * Failure modes: catches solver errors and posts an error response instead of
 *                terminating the worker. No external side effects.
 *
 * Performance: solver-bound; message payload copies the scene once each way.
 */

import { autoSeatScene, type AutoSeatingOptions, type AutoSeatingResult } from '../autoSeating/autoSeating'
import type { Scene } from '../domain/types'

export interface AutoSeatingWorkerRequest {
  id: string
  scene: Scene
  options?: AutoSeatingOptions
}

export interface AutoSeatingWorkerResponse {
  id: string
  ok: boolean
  result?: AutoSeatingResult
  error?: string
}

export function runAutoSeatingWorkerRequest(request: AutoSeatingWorkerRequest): AutoSeatingWorkerResponse {
  try {
    return {
      id: request.id,
      ok: true,
      result: autoSeatScene(request.scene, request.options),
    }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Auto seating failed.',
    }
  }
}

interface AutoSeatingWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<AutoSeatingWorkerRequest>) => void): void
  postMessage(message: AutoSeatingWorkerResponse): void
}

const workerScope =
  typeof self !== 'undefined' && typeof document === 'undefined' && 'postMessage' in self
    ? (self as unknown as AutoSeatingWorkerScope)
    : undefined

workerScope?.addEventListener('message', (event: MessageEvent<AutoSeatingWorkerRequest>) => {
  workerScope.postMessage(runAutoSeatingWorkerRequest(event.data))
})
