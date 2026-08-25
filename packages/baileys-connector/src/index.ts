import { fetchLatestWaWebVersion } from 'zapo-js'

import { makeWASocket } from './socket/makeWASocket'
import type { WAVersion } from './types'

export { makeWASocket }
export type { WASocket } from './socket/makeWASocket'
export type { WASocketConfig } from './socket/config'
export { WaBaileysEventEmitter } from './socket/emitter'
export { toGroupMetadata } from './socket/groups'

export {
    BROADCAST_SERVER,
    Browsers,
    DisconnectReason,
    GROUP_SERVER,
    LID_SERVER,
    NEWSLETTER_SERVER,
    S_WHATSAPP_NET,
    STATUS_BROADCAST_JID,
    toDisconnectStatusCode,
    WAMessageStatus,
    WAMessageStubType
} from './constants'
export type { DisconnectReasonCode } from './constants'
export { createBoomError } from './errors'
export type { BoomLikeError } from './errors'

export {
    areJidsSameUser,
    isJidBroadcast,
    isJidGroup,
    isJidNewsletter,
    isJidStatusBroadcast,
    isJidUser,
    isLidUser,
    jidDecode,
    jidEncode,
    jidNormalizedUser
} from './jid'
export type { FullJid } from './jid'

export { makeCacheableSignalKeyStore, useZapoAuthState, ZAPO_AUTH_STATE } from './auth/state'
export type { ZapoAuthBinding, ZapoAuthState } from './auth/state'
export { useMultiFileAuthState } from './auth/useMultiFileAuthState'
export type { UseMultiFileAuthStateResult } from './auth/useMultiFileAuthState'

export { downloadContentFromMessage, downloadMediaMessage } from './message/media'
export type { MediaDownloadOptions } from './message/media'
export { readDisappearingToggle, toZapoSend } from './message/content'
export type { ZapoSendInput } from './message/content'
export { buildSentWaMessage, toWaMessage } from './message/web-message'
export { toZapoMedia } from './message/media-input'
export type { ZapoMediaInput } from './message/media-input'

export { resolveLogger } from './logger'
export type { BaileysLogger } from './logger'

export * from './types'

export { delay } from 'zapo-js'
export { getContentType, unwrapMessage as normalizeMessageContent } from 'zapo-js'
export { proto } from 'zapo-js/proto'
export { proto as WAProto } from 'zapo-js/proto'
export type { Proto } from 'zapo-js/proto'

/**
 * Baileys' `fetchLatestBaileysVersion`, resolved from the same public source
 * zapo-js reads. `isLatest` is always `true`: the value comes from the live
 * source rather than a bundled snapshot, so there is nothing to compare against.
 */
export async function fetchLatestBaileysVersion(): Promise<{
    version: WAVersion
    isLatest: boolean
}> {
    const latest = await fetchLatestWaWebVersion()
    return { version: latest.parts, isLatest: true }
}

/**
 * Default export, so `import makeWASocket from '@whiskeysockets/baileys'`
 * keeps working after the dependency is aliased to this package. The repository
 * otherwise uses named exports only; this one exists purely for drop-in parity.
 */
export default makeWASocket
