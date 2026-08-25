import { randomBytes } from 'node:crypto'

import { type BinaryNode, resolveMediaPayload, WaClient, type WaGroupMetadata } from 'zapo-js'
import { bytesToHex } from 'zapo-js/util'

import { readZapoBinding } from '../auth/state'
import { createBoomError } from '../errors'
import { readDisappearingToggle, toZapoSend } from '../message/content'
import { buildSentWaMessage } from '../message/web-message'
import type {
    AnyMessageContent,
    AuthenticationCreds,
    BaileysEventEmitter,
    ChatModification,
    ConnectionState,
    Contact,
    GroupMetadata,
    GroupSettingUpdate,
    MessageReceiptType,
    MiscMessageGenerationOptions,
    OnWhatsAppResult,
    ParticipantAction,
    ParticipantUpdateResult,
    WAMessage,
    WAMessageKey
} from '../types'

import { resolveClientOptions, resolveSocketLogger, type WASocketConfig } from './config'
import { WaBaileysEventEmitter } from './emitter'
import { bridgeEvents, type EventBridgeState } from './events-bridge'
import { toGroupMetadata } from './groups'

const PARTICIPANT_UPDATERS = Object.freeze({
    add: 'addParticipants',
    remove: 'removeParticipants',
    promote: 'promoteParticipants',
    demote: 'demoteParticipants'
} as const)

const GROUP_SETTINGS = Object.freeze({
    announcement: { setting: 'announcement', enabled: true },
    not_announcement: { setting: 'announcement', enabled: false },
    locked: { setting: 'restrict', enabled: true },
    unlocked: { setting: 'restrict', enabled: false }
} as const)

export interface WASocket {
    readonly type: 'md'
    readonly ev: BaileysEventEmitter
    readonly authState: { creds: AuthenticationCreds }
    readonly user: Contact | undefined
    /** The underlying zapo-js client, for anything the connector does not map. */
    readonly zapo: WaClient

    generateMessageTag(): string
    waitForConnectionUpdate(
        check: (update: Partial<ConnectionState>) => boolean | undefined,
        timeoutMs?: number
    ): Promise<void>
    requestPairingCode(phoneNumber: string, customCode?: string): Promise<string>
    logout(): Promise<void>
    end(error?: Error): Promise<void>

    sendNode(node: BinaryNode): Promise<void>
    query(node: BinaryNode, timeoutMs?: number): Promise<BinaryNode>

    sendMessage(
        jid: string,
        content: AnyMessageContent,
        options?: MiscMessageGenerationOptions
    ): Promise<WAMessage | undefined>
    sendPresenceUpdate(
        type: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused',
        toJid?: string
    ): Promise<void>
    presenceSubscribe(jid: string): Promise<void>
    readMessages(keys: WAMessageKey[]): Promise<void>
    sendReceipt(
        jid: string,
        participant: string | undefined,
        messageIds: string[],
        type: MessageReceiptType
    ): Promise<void>
    updateMediaMessage(message: WAMessage): Promise<WAMessage>

    onWhatsApp(...jids: string[]): Promise<OnWhatsAppResult[]>
    profilePictureUrl(jid: string, type?: 'preview' | 'image'): Promise<string | undefined>
    updateProfilePicture(jid: string, content: Uint8Array): Promise<void>
    removeProfilePicture(jid: string): Promise<void>
    updateProfileStatus(status: string): Promise<void>
    updateProfileName(name: string): Promise<void>
    fetchStatus(jid: string): Promise<{ status?: string | null; setAt?: Date }>
    fetchBlocklist(): Promise<string[]>
    updateBlockStatus(jid: string, action: 'block' | 'unblock'): Promise<void>
    chatModify(modification: ChatModification, jid: string): Promise<void>

    groupMetadata(jid: string): Promise<GroupMetadata>
    groupCreate(subject: string, participants: string[]): Promise<GroupMetadata>
    groupLeave(jid: string): Promise<void>
    groupUpdateSubject(jid: string, subject: string): Promise<void>
    groupUpdateDescription(jid: string, description?: string): Promise<void>
    groupParticipantsUpdate(
        jid: string,
        participants: string[],
        action: ParticipantAction
    ): Promise<ParticipantUpdateResult[]>
    groupSettingUpdate(jid: string, setting: GroupSettingUpdate): Promise<void>
    groupInviteCode(jid: string): Promise<string>
    groupRevokeInvite(jid: string): Promise<string>
    groupAcceptInvite(code: string): Promise<string>
    groupGetInviteInfo(code: string): Promise<Partial<GroupMetadata>>
    groupToggleEphemeral(jid: string, expiration: number): Promise<void>
    groupFetchAllParticipating(): Promise<Record<string, GroupMetadata>>
}

/**
 * Creates a Baileys-shaped socket backed by a zapo-js `WaClient`.
 *
 * The call is synchronous and starts connecting in the background, exactly like
 * upstream: subscribe to `sock.ev.on('connection.update', ...)` for the QR, the
 * open transition, and disconnects. A failure to connect surfaces as a
 * `connection.update` with `connection: 'close'` and a Boom-shaped
 * `lastDisconnect.error`, never as a throw from this function.
 *
 * @throws when `config.auth` was not produced by this package.
 * @example
 * ```ts
 * const { state, saveCreds } = await useMultiFileAuthState('./auth')
 * const sock = makeWASocket({ auth: state, browser: Browsers.ubuntu('Chrome') })
 * sock.ev.on('creds.update', saveCreds)
 * sock.ev.on('messages.upsert', ({ messages }) => console.log(messages[0]?.key))
 * ```
 */
export function makeWASocket(config: WASocketConfig): WASocket {
    const { options } = resolveClientOptions(config)
    const logger = resolveSocketLogger(config)
    const client = new WaClient(options, logger)

    const ev = new WaBaileysEventEmitter()
    const state: EventBridgeState = { connection: 'connecting' }
    bridgeEvents(client, ev, state)

    const creds = config.auth.creds
    const refreshCreds = (): void => {
        const current = client.getCredentials()
        if (!current) {
            return
        }
        creds.registered = current.meJid !== undefined
        creds.platform = current.platform
        creds.account = current.signedIdentity ?? undefined
        creds.me = current.meJid
            ? { id: current.meJid, lid: current.meLid, name: current.meDisplayName }
            : undefined
    }
    client.on('connection', refreshCreds)
    client.on('auth_paired', refreshCreds)

    const shouldIgnoreJid = config.shouldIgnoreJid
    if (shouldIgnoreJid) {
        client.ignoreKey((ctx) => ctx.remoteJid !== null && shouldIgnoreJid(ctx.remoteJid) === true)
    }

    void client.connect().catch((error: unknown) => {
        state.connection = 'close'
        const message = error instanceof Error ? error.message : String(error)
        ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: createBoomError(message, 428), date: new Date() }
        })
    })

    const meJid = (): string | undefined => client.getCredentials()?.meJid ?? undefined

    const sock: WASocket = {
        type: 'md',
        ev,
        authState: { creds },
        get user(): Contact | undefined {
            refreshCreds()
            return creds.me
        },
        zapo: client,

        generateMessageTag: () => bytesToHex(randomBytes(8)).toUpperCase(),

        waitForConnectionUpdate: (check, timeoutMs) =>
            new Promise<void>((resolve, reject) => {
                let timer: NodeJS.Timeout | undefined
                const listener = (update: Partial<ConnectionState>): void => {
                    if (check(update) !== true) {
                        return
                    }
                    ev.off('connection.update', listener)
                    if (timer) {
                        clearTimeout(timer)
                    }
                    resolve()
                }
                ev.on('connection.update', listener)
                if (timeoutMs !== undefined) {
                    timer = setTimeout(() => {
                        ev.off('connection.update', listener)
                        reject(createBoomError('connection update timed out', 408))
                    }, timeoutMs)
                }
            }),

        requestPairingCode: (phoneNumber, customCode) =>
            client.auth.requestPairingCode(phoneNumber, true, customCode),

        logout: () => client.logout(),
        end: () => client.disconnect(),

        sendNode: (node) => client.lowlevel.sendNode(node),
        query: (node, timeoutMs) => client.lowlevel.query(node, timeoutMs),

        sendMessage: async (jid, content, sendOptions = {}) => {
            const ephemeral = readDisappearingToggle(content)
            if (ephemeral !== null) {
                await client.group.setEphemeralDuration(jid, ephemeral)
                return undefined
            }
            const mapped = await toZapoSend(content, sendOptions)
            const result = await client.message.send(jid, mapped.content, mapped.options)
            return buildSentWaMessage({
                remoteJid: jid,
                id: result.id,
                meJid: meJid(),
                timestampSeconds: Math.floor(Date.now() / 1_000)
            })
        },

        sendPresenceUpdate: async (type, toJid) => {
            if (type === 'available' || type === 'unavailable') {
                await client.presence.send(type)
                return
            }
            if (!toJid) {
                throw new Error(`sendPresenceUpdate(${type}) requires a target jid`)
            }
            // WhatsApp has no distinct "recording" chatstate: it is `composing`
            // with an audio media hint, which is how the phone renders it.
            await client.presence.sendChatstate(
                toJid,
                type === 'recording'
                    ? { state: 'composing', media: 'audio' }
                    : { state: type === 'paused' ? 'paused' : 'composing' }
            )
        },

        presenceSubscribe: (jid) => client.presence.subscribe(jid),

        readMessages: async (keys) => {
            const byChat = new Map<string, string[]>()
            for (const key of keys) {
                if (!key.remoteJid || !key.id) {
                    continue
                }
                const ids = byChat.get(key.remoteJid)
                if (ids) {
                    ids.push(key.id)
                } else {
                    byChat.set(key.remoteJid, [key.id])
                }
            }
            for (const [jid, ids] of byChat) {
                await client.message.sendReceipt(jid, ids, { type: 'read' })
            }
        },

        sendReceipt: async (jid, participant, messageIds, type) => {
            await client.message.sendReceipt(jid, messageIds, {
                type: type === 'played' ? 'played' : type === 'inactive' ? 'inactive' : 'read',
                participant
            })
        },

        updateMediaMessage: async (message) => {
            const key = message.key
            if (!key.remoteJid || !key.id || !message.message) {
                throw new Error('updateMediaMessage requires a message with key and content')
            }
            const payload = resolveMediaPayload(message.message)
            if (!payload) {
                throw new Error('updateMediaMessage requires a message carrying media')
            }
            const retry = await client.message.requestMediaReupload({
                chatJid: key.remoteJid,
                messageId: key.id,
                mediaKey: payload.mediaKey,
                fromMe: key.fromMe === true,
                participant: key.participant ?? undefined
            })
            if (retry.result !== 'success') {
                throw createBoomError(`media re-upload failed: ${retry.result}`, 404, retry)
            }
            return message
        },

        onWhatsApp: async (...jids) => {
            const results = await client.profile.getLidsByPhoneNumbers(jids)
            return results.map((result) => ({
                exists: result.exists,
                jid: result.phoneJid,
                lid: result.lidJid ?? undefined
            }))
        },

        profilePictureUrl: async (jid, type = 'preview') => {
            const picture = await client.profile.getProfilePicture(jid, type)
            return picture.url
        },

        updateProfilePicture: async (jid, content) => {
            await client.profile.setProfilePicture(content, jid)
        },

        removeProfilePicture: async (jid) => {
            await client.profile.deleteProfilePicture(jid)
        },

        updateProfileStatus: (status) => client.profile.setStatus(status),
        updateProfileName: (name) => client.profile.setPushName(name),

        fetchStatus: async (jid) => {
            const result = await client.profile.getStatus(jid)
            return { status: result.status }
        },

        fetchBlocklist: async () => {
            const blocklist = await client.privacy.getBlocklist()
            return [...blocklist.jids]
        },

        updateBlockStatus: async (jid, action) => {
            if (action === 'block') {
                await client.privacy.blockUser(jid)
                return
            }
            await client.privacy.unblockUser(jid)
        },

        chatModify: async (modification, jid) => {
            if ('archive' in modification) {
                await client.chat.setChatArchive(jid, modification.archive)
                return
            }
            if ('pin' in modification) {
                await client.chat.setChatPin(jid, modification.pin)
                return
            }
            if ('mute' in modification) {
                await client.chat.setChatMute(
                    jid,
                    modification.mute !== null,
                    modification.mute === null ? undefined : Date.now() + modification.mute
                )
                return
            }
            if ('markRead' in modification) {
                await client.chat.setChatRead(jid, modification.markRead)
                return
            }
            if ('clear' in modification) {
                await client.chat.clearChat(jid)
                return
            }
            if ('delete' in modification) {
                await client.chat.deleteChat(jid)
                return
            }
            if ('star' in modification) {
                for (const message of modification.star.messages) {
                    await client.chat.setMessageStar(
                        { chatJid: jid, id: message.id, fromMe: message.fromMe === true },
                        modification.star.star
                    )
                }
                return
            }
            throw new Error(`unsupported chatModify: [${Object.keys(modification).join(', ')}]`)
        },

        groupMetadata: async (jid) => toGroupMetadata(await client.group.queryGroupMetadata(jid)),

        groupCreate: async (subject, participants) =>
            toGroupMetadata(await client.group.createGroup(subject, participants)),

        groupLeave: async (jid) => {
            await client.group.leaveGroup([jid])
        },

        groupUpdateSubject: (jid, subject) => client.group.setSubject(jid, subject),

        groupUpdateDescription: async (jid, description) => {
            await client.group.setDescription(jid, description ?? null)
        },

        groupParticipantsUpdate: async (jid, participants, action) => {
            const results = await client.group[PARTICIPANT_UPDATERS[action]](jid, participants)
            return results.map((result) => ({
                status: String(result.code),
                jid: result.jid,
                lid: result.phoneNumber
            }))
        },

        groupSettingUpdate: async (jid, setting) => {
            const mapped = GROUP_SETTINGS[setting]
            if (!mapped) {
                throw new Error(`unsupported group setting: ${setting}`)
            }
            await client.group.setSetting(jid, mapped.setting, mapped.enabled)
        },

        groupInviteCode: (jid) => client.group.queryInviteCode(jid),

        groupRevokeInvite: async (jid) => {
            const result = await client.group.revokeInvite(jid)
            return result.code
        },

        groupAcceptInvite: async (code) => {
            const metadata: WaGroupMetadata = await client.group.joinGroupViaInvite(code)
            return metadata.jid
        },

        groupGetInviteInfo: async (code) => {
            const info = await client.group.queryGroupInviteInfo(code)
            return {
                id: info.jid,
                subject: info.subject,
                subjectOwner: info.subjectOwner,
                subjectTime: info.subjectTime,
                creation: info.creation,
                desc: info.desc,
                descOwner: info.descOwner,
                descId: info.descId,
                size: info.size,
                ephemeralDuration: info.ephemeral
            }
        },

        groupToggleEphemeral: async (jid, expiration) => {
            await client.group.setEphemeralDuration(jid, expiration)
        },

        groupFetchAllParticipating: async () => {
            const groups = await client.group.queryAllGroups()
            const result: Record<string, GroupMetadata> = {}
            for (const group of groups) {
                result[group.jid] = toGroupMetadata(group)
            }
            return result
        }
    }

    return sock
}

export { readZapoBinding }
