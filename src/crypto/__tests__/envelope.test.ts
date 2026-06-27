import {
  CryptoDecryptionError,
  CryptoKeyImportError,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  exportKeyFragment,
  generateDocumentKey,
  importKeyFragment,
} from '../envelope'

describe('crypto envelope', () => {
  it('round-trips JSON with an exported key fragment', async () => {
    const key = await generateDocumentKey()
    const fragment = await exportKeyFragment(key)
    const imported = await importKeyFragment(fragment)
    const payload = {
      schemaVersion: 1,
      name: 'Reception layout',
      guests: ['Ana', 'Bruno'],
    }

    const envelope = await encryptJson(imported, payload)
    const decrypted = await decryptJson(imported, envelope)

    expect(decrypted).toEqual(payload)
    expect(envelope).toMatchObject({
      version: 1,
      alg: 'AES-GCM',
      encoding: 'json',
    })
  })

  it('round-trips binary-like update payloads', async () => {
    const key = await generateDocumentKey()
    const payload = new Uint8Array([1, 5, 9, 13, 255])

    const envelope = await encryptBytes(key, payload)
    const decrypted = await decryptBytes(key, envelope)

    expect(Array.from(decrypted)).toEqual(Array.from(payload))
  })

  it('rejects malformed key fragments and tampered envelopes', async () => {
    const key = await generateDocumentKey()
    const envelope = await encryptJson(key, { ok: true })

    await expect(importKeyFragment('not-valid')).rejects.toBeInstanceOf(CryptoKeyImportError)
    await expect(
      decryptJson(key, {
        ...envelope,
        ciphertext: `${envelope.ciphertext.slice(0, -2)}AA`,
      }),
    ).rejects.toBeInstanceOf(CryptoDecryptionError)
  })
})
