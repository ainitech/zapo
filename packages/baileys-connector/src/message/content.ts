import type { WaSendMessageContent, WaSendMessageOptions } from 'zapo-js'
import type { Proto } from 'zapo-js/proto'
import { base64ToBytes } from 'zapo-js/util'

import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessageKey } from '../types'

import { toZapoMedia } from './media-input'

export interface ZapoSendInput {
    readonly content: WaSendMessageContent
    readonly options: WaSendMessageOptions
}

/** Recognizes the `{ disappearingMessagesInChat }` pseudo-content Baileys routes to a group IQ. */
export function readDisappearingToggle(content: AnyMessageContent): number | null {
    if (typeof content !== 'object' || content === null) {
        return null
    }
    if (!('disappearingMessagesInChat' in content)) {
        return null
    }
    const value = content.disappearingMessagesInChat
    if (typeof value === 'boolean') {
        return value ? 7 * 24 * 60 * 60 : 0
    }
    return typeof value === 'number' ? value : 0
}

function toMessageKey(key: WAMessageKey): {
    remoteJid: string
    id: string
    fromMe: boolean
    participant?: string
} {
    if (!key.remoteJid || !key.id) {
        throw new Error('message key requires remoteJid and id')
    }
    return {
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: key.fromMe === true,
        participant: key.participant ?? undefined
    }
}

function readThumbnail(value: string | Uint8Array | undefined): Uint8Array | undefined {
    if (value === undefined) {
        return undefined
    }
    return typeof value === 'string' ? base64ToBytes(value) : value
}

function buildBaseOptions(
    content: AnyMessageContent,
    options: MiscMessageGenerationOptions
): WaSendMessageOptions {
    const bag = content as Record<string, unknown>
    const mapped: Record<string, unknown> = {}

    if (options.messageId !== undefined) {
        mapped.id = options.messageId
    }
    if (options.quoted?.key?.remoteJid && options.quoted.key.id) {
        mapped.quote = {
            id: options.quoted.key.id,
            remoteJid: options.quoted.key.remoteJid,
            participant: options.quoted.key.participant ?? undefined,
            message: options.quoted.message ?? undefined
        }
    }
    if (options.ephemeralExpiration !== undefined) {
        const seconds = Number(options.ephemeralExpiration)
        if (Number.isFinite(seconds)) {
            mapped.expirationSeconds = seconds
        }
    }
    if (options.mediaUploadTimeoutMs !== undefined) {
        mapped.ackTimeoutMs = options.mediaUploadTimeoutMs
    }
    if (Array.isArray(bag.mentions)) {
        mapped.mentions = bag.mentions as readonly string[]
    }
    if (bag.contextInfo !== undefined) {
        mapped.contextInfo = { raw: bag.contextInfo as Proto.IContextInfo }
    }
    if (bag.viewOnce === true) {
        mapped.viewOnce = true
    }
    if (bag.edit !== undefined) {
        mapped.editKey = toMessageKey(bag.edit as WAMessageKey)
    }

    return mapped
}

async function buildMediaContent(
    content: Record<string, unknown>,
    contextInfo: Proto.IContextInfo | undefined
): Promise<WaSendMessageContent | null> {
    const shared = {
        mimetype: content.mimetype as string | undefined,
        contextInfo: contextInfo === undefined ? undefined : { raw: contextInfo }
    }

    if (content.image !== undefined) {
        return {
            type: 'image',
            media: await toZapoMedia(content.image as never),
            caption: content.caption as string | undefined,
            jpegThumbnail: readThumbnail(content.jpegThumbnail as string | undefined),
            width: content.width as number | undefined,
            height: content.height as number | undefined,
            ...shared
        }
    }
    if (content.video !== undefined) {
        return {
            type: content.ptv === true ? 'ptv' : 'video',
            media: await toZapoMedia(content.video as never),
            caption: content.caption as string | undefined,
            gifPlayback: content.gifPlayback as boolean | undefined,
            jpegThumbnail: readThumbnail(content.jpegThumbnail as string | undefined),
            width: content.width as number | undefined,
            height: content.height as number | undefined,
            ...shared
        }
    }
    if (content.audio !== undefined) {
        return {
            type: 'audio',
            media: await toZapoMedia(content.audio as never),
            ptt: content.ptt as boolean | undefined,
            seconds: content.seconds as number | undefined,
            ...shared
        }
    }
    if (content.sticker !== undefined) {
        return {
            type: 'sticker',
            media: await toZapoMedia(content.sticker as never),
            isAnimated: content.isAnimated as boolean | undefined,
            width: content.width as number | undefined,
            height: content.height as number | undefined,
            ...shared
        }
    }
    if (content.document !== undefined) {
        return {
            type: 'document',
            media: await toZapoMedia(content.document as never),
            fileName: content.fileName as string | undefined,
            caption: content.caption as string | undefined,
            ...shared
        }
    }
    return null
}

/**
 * Translates a Baileys `sendMessage(jid, content, options)` call into the
 * `(content, options)` pair `client.message.send` takes.
 *
 * Content kinds zapo-js models natively (text, media, poll, reaction, revoke,
 * pin, edit) map onto its typed shapes; everything else is handed over as a
 * raw `Proto.IMessage`, which `send` accepts verbatim.
 *
 * @throws when the content object matches no known Baileys shape, or a key
 * required to target an existing message is missing.
 */
export async function toZapoSend(
    content: AnyMessageContent,
    options: MiscMessageGenerationOptions = {}
): Promise<ZapoSendInput> {
    if (typeof content !== 'object' || content === null) {
        throw new Error('sendMessage content must be an object')
    }

    const bag = content as Record<string, unknown>
    const sendOptions = buildBaseOptions(content, options)
    const contextInfo = bag.contextInfo as Proto.IContextInfo | undefined

    if (typeof bag.text === 'string') {
        const linkPreview = bag.linkPreview
        return {
            content: {
                type: 'text',
                text: bag.text,
                contextInfo: contextInfo === undefined ? undefined : { raw: contextInfo },
                linkPreview: linkPreview === null ? false : undefined
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    const media = await buildMediaContent(bag, contextInfo)
    if (media !== null) {
        return { content: media, options: sendOptions }
    }

    if (bag.poll !== undefined) {
        const poll = bag.poll as { name: string; values: string[]; selectableCount?: number }
        return {
            content: {
                type: 'poll',
                name: poll.name,
                options: poll.values,
                selectableCount: poll.selectableCount,
                contextInfo: contextInfo === undefined ? undefined : { raw: contextInfo }
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.react !== undefined) {
        const react = bag.react as Proto.Message.IReactionMessage
        if (!react.key) {
            throw new Error('react content requires a key')
        }
        return {
            content: {
                type: 'reaction',
                emoji: react.text ?? '',
                target: toMessageKey(react.key)
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.delete !== undefined) {
        return {
            content: {
                type: 'revoke',
                target: toMessageKey(bag.delete as WAMessageKey)
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.pin !== undefined) {
        // proto.PinInChat.Type: 1 = PIN_FOR_ALL, 2 = UNPIN_FOR_ALL.
        const unpin = bag.type === 2
        return {
            content: {
                type: unpin ? 'unpin' : 'pin',
                target: toMessageKey(bag.pin as WAMessageKey),
                durationSecs: bag.time as number | undefined
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.forward !== undefined) {
        const forwarded = bag.forward as { message?: Proto.IMessage }
        if (!forwarded.message) {
            throw new Error('forward content requires the source message')
        }
        return {
            content: forwarded.message as WaSendMessageContent,
            options: { ...sendOptions, forward: true }
        }
    }

    if (bag.location !== undefined) {
        return {
            content: { locationMessage: bag.location } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.contacts !== undefined) {
        const contacts = bag.contacts as {
            displayName?: string
            contacts: Proto.Message.IContactMessage[]
        }
        if (contacts.contacts.length === 1) {
            return {
                content: { contactMessage: contacts.contacts[0] } as WaSendMessageContent,
                options: sendOptions
            }
        }
        return {
            content: {
                contactsArrayMessage: {
                    displayName: contacts.displayName,
                    contacts: contacts.contacts
                }
            } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.listReply !== undefined) {
        return {
            content: { listResponseMessage: bag.listReply } as WaSendMessageContent,
            options: sendOptions
        }
    }

    if (bag.interactiveMessage !== undefined) {
        return {
            content: { interactiveMessage: bag.interactiveMessage } as WaSendMessageContent,
            options: sendOptions
        }
    }

    throw new Error(
        `unsupported sendMessage content: no mapping for keys [${Object.keys(bag).join(', ')}]`
    )
}
