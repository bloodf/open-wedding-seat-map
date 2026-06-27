/**
 * Purpose: Encrypts and decrypts Wedding Seat Map payloads with AES-GCM keys
 *          carried as URL fragments outside Supabase storage.
 *
 * Public API: generateDocumentKey, importKeyFragment, exportKeyFragment,
 *             encryptJson, decryptJson, encryptBytes, decryptBytes,
 *             base64Url helpers, and crypto-specific error classes.
 *
 * Upstream deps: Web Crypto SubtleCrypto, TextEncoder, TextDecoder.
 *
 * Downstream consumers: capability link helpers, offline queue tests, future
 *                       collaboration persistence and import/export flows.
 *
 * Failure modes: throws CryptoUnavailableError when Web Crypto is unavailable,
 *                CryptoKeyImportError for malformed key fragments, and
 *                CryptoDecryptionError for tampered or incompatible envelopes.
 *
 * Performance: AES-GCM is native and suitable for document snapshots and Yjs
 *              update payloads; callers should chunk very large exports.
 */

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type BytesLike = ArrayBuffer | ArrayBufferView

export interface EncryptedEnvelope {
  version: 1
  alg: 'AES-GCM'
  encoding: 'json' | 'bytes'
  iv: string
  ciphertext: string
}

export class CryptoEnvelopeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CryptoEnvelopeError'
  }
}

export class CryptoUnavailableError extends CryptoEnvelopeError {
  constructor(message = 'Web Crypto is unavailable in this runtime') {
    super(message)
    this.name = 'CryptoUnavailableError'
  }
}

export class CryptoKeyImportError extends CryptoEnvelopeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CryptoKeyImportError'
  }
}

export class CryptoEncryptionError extends CryptoEnvelopeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CryptoEncryptionError'
  }
}

export class CryptoDecryptionError extends CryptoEnvelopeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CryptoDecryptionError'
  }
}

const AES_GCM_ALGORITHM = 'AES-GCM'
const AES_256_KEY_BYTES = 32
const GCM_IV_BYTES = 12
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function generateDocumentKey(): Promise<CryptoKey> {
  const subtle = getSubtleCrypto()

  return subtle.generateKey(
    { name: AES_GCM_ALGORITHM, length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function exportKeyFragment(key: CryptoKey): Promise<string> {
  try {
    const raw = await getSubtleCrypto().exportKey('raw', key)
    return bytesToBase64Url(new Uint8Array(raw))
  } catch (error) {
    throw new CryptoKeyImportError('Unable to export AES-GCM key fragment', { cause: error })
  }
}

export async function importKeyFragment(fragment: string): Promise<CryptoKey> {
  let raw: Uint8Array

  try {
    raw = base64UrlToBytes(fragment)
  } catch (error) {
    throw new CryptoKeyImportError('Key fragment is not valid base64url', { cause: error })
  }

  if (raw.byteLength !== AES_256_KEY_BYTES) {
    throw new CryptoKeyImportError('Key fragment must contain a 256-bit AES key')
  }

  try {
    return await getSubtleCrypto().importKey(
      'raw',
      toArrayBuffer(raw),
      AES_GCM_ALGORITHM,
      false,
      ['encrypt', 'decrypt'],
    )
  } catch (error) {
    throw new CryptoKeyImportError('Unable to import AES-GCM key fragment', { cause: error })
  }
}

export async function encryptJson<T extends JsonValue>(
  key: CryptoKey,
  value: T,
): Promise<EncryptedEnvelope> {
  return encryptPayload(key, textEncoder.encode(JSON.stringify(value)), 'json')
}

export async function decryptJson<T extends JsonValue = JsonValue>(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<T> {
  if (envelope.encoding !== 'json') {
    throw new CryptoDecryptionError('Encrypted envelope does not contain JSON')
  }

  const bytes = await decryptBytes(key, envelope)

  try {
    return JSON.parse(textDecoder.decode(bytes)) as T
  } catch (error) {
    throw new CryptoDecryptionError('Decrypted JSON payload is malformed', { cause: error })
  }
}

export async function encryptBytes(
  key: CryptoKey,
  value: BytesLike,
): Promise<EncryptedEnvelope> {
  return encryptPayload(key, toUint8Array(value), 'bytes')
}

export async function decryptBytes(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<Uint8Array> {
  assertEnvelope(envelope)

  try {
    const plaintext = await getSubtleCrypto().decrypt(
      { name: AES_GCM_ALGORITHM, iv: toArrayBuffer(base64UrlToBytes(envelope.iv)) },
      key,
      toArrayBuffer(base64UrlToBytes(envelope.ciphertext)),
    )

    return new Uint8Array(plaintext)
  } catch (error) {
    throw new CryptoDecryptionError('Unable to decrypt encrypted envelope', { cause: error })
  }
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.version === 1 &&
    value.alg === AES_GCM_ALGORITHM &&
    (value.encoding === 'json' || value.encoding === 'bytes') &&
    typeof value.iv === 'string' &&
    typeof value.ciphertext === 'string'
  )
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function randomBytes(byteLength: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new CryptoUnavailableError()
  }

  const bytes = new Uint8Array(byteLength)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(randomBytes(byteLength))
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await getSubtleCrypto().digest('SHA-256', toArrayBuffer(textEncoder.encode(value)))
  return bytesToBase64Url(new Uint8Array(digest))
}

async function encryptPayload(
  key: CryptoKey,
  plaintext: Uint8Array,
  encoding: EncryptedEnvelope['encoding'],
): Promise<EncryptedEnvelope> {
  const iv = randomBytes(GCM_IV_BYTES)

  try {
    const ciphertext = await getSubtleCrypto().encrypt(
      { name: AES_GCM_ALGORITHM, iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(plaintext),
    )

    return {
      version: 1,
      alg: AES_GCM_ALGORITHM,
      encoding,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    }
  } catch (error) {
    throw new CryptoEncryptionError('Unable to encrypt payload', { cause: error })
  }
}

function assertEnvelope(envelope: EncryptedEnvelope): void {
  if (!isEncryptedEnvelope(envelope)) {
    throw new CryptoDecryptionError('Encrypted envelope shape is invalid')
  }
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle

  if (!subtle) {
    throw new CryptoUnavailableError()
  }

  return subtle
}

function toUint8Array(value: BytesLike): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (!ArrayBuffer.isView(value)) {
    throw new CryptoEncryptionError('Payload must be ArrayBuffer or ArrayBufferView')
  }

  const bytes = new Uint8Array(value.byteLength)
  bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
