/**
 * Purpose: Builds anonymous view/edit capability links without persisting raw
 *          bearer tokens or document keys.
 *
 * Public API: createAnonymousCapabilityLink, formatMapCapabilityPath,
 *             parseMapCapabilityUrl, hashCapabilityToken.
 *
 * Upstream deps: Web Crypto helpers from src/crypto/envelope.
 *
 * Downstream consumers: sharing UI, Supabase link/session RPC callers, tests.
 *
 * Failure modes: parsing throws CapabilityLinkParseError for malformed links;
 *                token hashing throws crypto errors if Web Crypto is absent.
 *
 * Performance: SHA-256 and AES key generation are native and user-action scoped.
 */

import {
  exportKeyFragment,
  generateDocumentKey,
  randomBase64Url,
  sha256Base64Url,
} from '../../crypto/envelope'

export type CapabilityRole = 'view' | 'edit'

export interface CreateAnonymousCapabilityLinkInput {
  mapId: string
  role: CapabilityRole
  origin?: string
}

export interface AnonymousCapabilityLink {
  mapId: string
  role: CapabilityRole
  capabilityToken: string
  tokenHash: string
  keyFragment: string
  path: string
  url: string
}

export interface ParsedCapabilityLink {
  mapId: string
  capabilityToken: string
  keyFragment: string
}

export class CapabilityLinkParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CapabilityLinkParseError'
  }
}

const LOCAL_PARSE_ORIGIN = 'https://wedding-seat-map.local'

export async function createAnonymousCapabilityLink(
  input: CreateAnonymousCapabilityLinkInput,
): Promise<AnonymousCapabilityLink> {
  const capabilityToken = randomBase64Url(32)
  const documentKey = await generateDocumentKey()
  const keyFragment = await exportKeyFragment(documentKey)
  const tokenHash = await hashCapabilityToken(capabilityToken)
  const path = formatMapCapabilityPath({
    mapId: input.mapId,
    capabilityToken,
    keyFragment,
  })

  return {
    mapId: input.mapId,
    role: input.role,
    capabilityToken,
    tokenHash,
    keyFragment,
    path,
    url: input.origin ? new URL(path, input.origin).toString() : path,
  }
}

export function formatMapCapabilityPath(parts: ParsedCapabilityLink): string {
  const mapId = encodeURIComponent(parts.mapId)
  const token = encodeURIComponent(parts.capabilityToken)
  const key = encodeURIComponent(parts.keyFragment)
  return `/m/${mapId}?token=${token}#key=${key}`
}

export function parseMapCapabilityUrl(input: string | URL): ParsedCapabilityLink {
  const url = typeof input === 'string' ? new URL(input, LOCAL_PARSE_ORIGIN) : input

  if (!url.pathname.startsWith('/m/')) {
    throw new CapabilityLinkParseError('Capability link path must start with /m/')
  }

  const encodedMapId = url.pathname.slice('/m/'.length)
  const capabilityToken = url.searchParams.get('token') ?? ''
  const keyFragment = new URLSearchParams(url.hash.replace(/^#/u, '')).get('key') ?? ''

  if (!encodedMapId || !capabilityToken || !keyFragment) {
    throw new CapabilityLinkParseError('Capability link requires map id, token, and key fragment')
  }

  return {
    mapId: decodeURIComponent(encodedMapId),
    capabilityToken,
    keyFragment,
  }
}

export async function hashCapabilityToken(token: string): Promise<string> {
  if (!token.trim()) {
    throw new CapabilityLinkParseError('Capability token cannot be empty')
  }

  return sha256Base64Url(token)
}
