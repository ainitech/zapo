import type { WaIncomingMessageEvent } from 'zapo-js'
import type { Proto } from 'zapo-js/proto'

import type { WAMessage, WAMessageKey } from '../types'

/**
 * Rebuilds the `proto.IWebMessageInfo` Baileys hands to `messages.upsert` from
 * a zapo-js `message` event. zapo-js delivers the decrypted stanza rather than
 * a stored web-message row, so the envelope fields it does not carry
 * (`status`, `labels`, `starred`, ...) are left unset instead of guessed.
 */
export function toWaMessage(event: WaIncomingMessageEvent): WAMessage {
    const key: WAMessageKey = {
        remoteJid: event.key.remoteJid,
        id: event.key.id,
        fromMe: event.key.fromMe,
        participant: event.key.participant,
        senderLid: event.key.participantAlt,
        senderPn: event.key.remoteJidAlt
    }
    const message: WAMessage = {
        key,
        message: event.message ?? undefined,
        messageTimestamp: event.timestampSeconds,
        pushName: event.pushName,
        broadcast: event.key.isBroadcast
    }
    if (event.key.serverId !== undefined) {
        message.newsletterServerId = event.key.serverId
    }
    return message
}

/**
 * Builds the `WAMessage` that `sock.sendMessage` resolves with. The wire ack
 * only returns the stanza id, so the envelope is assembled from the send
 * inputs - the same fields upstream Baileys fills locally before relaying.
 */
export function buildSentWaMessage(input: {
    readonly remoteJid: string
    readonly id: string
    readonly meJid?: string
    readonly message?: Proto.IMessage
    readonly timestampSeconds: number
}): WAMessage {
    return {
        key: {
            remoteJid: input.remoteJid,
            id: input.id,
            fromMe: true,
            participant: input.meJid
        },
        message: input.message,
        messageTimestamp: input.timestampSeconds,
        status: 1
    }
}
