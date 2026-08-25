import { Readable } from 'node:stream'

import type { WAMediaUpload } from '../types'

/** The media shapes `client.message.send` accepts for a media payload. */
export type ZapoMediaInput = Uint8Array | Readable | string

function isReadable(value: unknown): value is Readable {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Readable).pipe === 'function' &&
        typeof (value as Readable).read === 'function'
    )
}

async function fetchRemoteMedia(url: string): Promise<Uint8Array> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`media download failed with status ${response.status}: ${url}`)
    }
    return new Uint8Array(await response.arrayBuffer())
}

/**
 * Converts Baileys' `WAMediaUpload` into the input `client.message.send`
 * accepts. Buffers and streams pass straight through; `{ url }` resolves to a
 * local path for `file:` URLs and bare paths, and is downloaded for
 * `http(s):` URLs (zapo-js only opens local paths itself).
 */
export async function toZapoMedia(media: WAMediaUpload): Promise<ZapoMediaInput> {
    if (media instanceof Uint8Array) {
        return media
    }
    if (isReadable(media)) {
        return media
    }
    if (typeof media === 'object' && media !== null && 'stream' in media) {
        const { stream } = media
        return isReadable(stream) ? stream : Readable.from(stream as AsyncIterable<Uint8Array>)
    }
    if (typeof media === 'object' && media !== null && 'url' in media) {
        const raw = media.url
        const url = typeof raw === 'string' ? raw : raw.toString()
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return fetchRemoteMedia(url)
        }
        if (url.startsWith('file://')) {
            return new URL(url).pathname
        }
        return url
    }
    throw new Error('unsupported media input: expected bytes, { stream } or { url }')
}
