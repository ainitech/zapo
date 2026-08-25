import type { Readable } from 'node:stream'

import { downloadMediaMessage as downloadZapoMedia } from 'zapo-js'
import type { Proto } from 'zapo-js/proto'
import { readAllBytes } from 'zapo-js/util'

import type { DownloadableMessage, MediaType, WAMessage } from '../types'

export interface MediaDownloadOptions {
    readonly maxBytes?: number
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
}

const MEDIA_FIELD: Readonly<Record<string, string>> = Object.freeze({
    image: 'imageMessage',
    video: 'videoMessage',
    audio: 'audioMessage',
    document: 'documentMessage',
    sticker: 'stickerMessage',
    ptv: 'ptvMessage'
})

function toProtoMessage(source: WAMessage | Proto.IMessage): Proto.IMessage {
    if ('key' in source && source.key !== undefined) {
        const message = source.message
        if (!message) {
            throw new Error('message has no content to download')
        }
        return message
    }
    return source
}

/**
 * Streams and decrypts a message's media. Mirrors Baileys' signature: `'buffer'`
 * resolves with the full payload, `'stream'` with the decrypted `Readable`.
 *
 * A `Buffer` (not a bare `Uint8Array`) is returned for `'buffer'` so existing
 * call sites doing `result.toString('base64')` keep working; it is a view over
 * the decrypted bytes, not a copy.
 *
 * @throws when the message carries no downloadable media, or the CDN blob is
 * gone (call `sock.updateMediaMessage` first to ask for a re-upload).
 */
export async function downloadMediaMessage(
    message: WAMessage | Proto.IMessage,
    type: 'buffer',
    options?: MediaDownloadOptions
): Promise<Buffer>
export async function downloadMediaMessage(
    message: WAMessage | Proto.IMessage,
    type: 'stream',
    options?: MediaDownloadOptions
): Promise<Readable>
export async function downloadMediaMessage(
    message: WAMessage | Proto.IMessage,
    type: 'buffer' | 'stream' = 'buffer',
    options: MediaDownloadOptions = {}
): Promise<Buffer | Readable> {
    const stream = await downloadZapoMedia(toProtoMessage(message), options)
    if (type === 'stream') {
        return stream
    }
    const bytes = await readAllBytes(stream, { maxBytes: options.maxBytes })
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/**
 * Baileys' `downloadContentFromMessage`. Takes the inner media node
 * (`msg.message.imageMessage`, ...) plus its kind and returns the decrypted
 * stream.
 *
 * @throws when `type` is not one of the media kinds zapo-js can resolve.
 */
export async function downloadContentFromMessage(
    content: DownloadableMessage,
    type: MediaType,
    options: MediaDownloadOptions = {}
): Promise<Readable> {
    const field = MEDIA_FIELD[type]
    if (field === undefined) {
        throw new Error(`unsupported media type for download: ${type}`)
    }
    return downloadZapoMedia({ [field]: content }, options)
}
