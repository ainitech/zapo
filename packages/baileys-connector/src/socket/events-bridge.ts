import type {
    WaAppStateMutationEvent,
    WaBlocklistResult,
    WaClient,
    WaConnectionEvent,
    WaGroupEvent,
    WaIncomingAddonEvent,
    WaIncomingCallEvent,
    WaIncomingChatstateEvent,
    WaIncomingMessageEvent,
    WaIncomingPresenceEvent,
    WaIncomingProtocolMessageEvent,
    WaIncomingReceiptEvent,
    WaOfflineResumeEvent
} from 'zapo-js'
import { proto } from 'zapo-js/proto'

import { toDisconnectStatusCode } from '../constants'
import { createBoomError } from '../errors'
import { toWaMessage } from '../message/web-message'
import type {
    BaileysEventEmitter,
    Contact,
    ParticipantAction,
    PresenceData,
    WACallEvent,
    WAMessageKey
} from '../types'

const RECEIPT_STATUS: Readonly<Record<string, number>> = Object.freeze({
    delivered: proto.WebMessageInfo.Status.DELIVERY_ACK,
    read: proto.WebMessageInfo.Status.READ,
    played: proto.WebMessageInfo.Status.PLAYED
})

const PARTICIPANT_ACTIONS: Readonly<Record<string, ParticipantAction>> = Object.freeze({
    add: 'add',
    remove: 'remove',
    promote: 'promote',
    demote: 'demote'
})

const CHATSTATE_PRESENCE: Readonly<Record<string, PresenceData['lastKnownPresence']>> =
    Object.freeze({
        composing: 'composing',
        recording: 'recording',
        paused: 'paused'
    })

const CALL_STATUS: Readonly<Record<string, WACallEvent['status']>> = Object.freeze({
    offer: 'offer',
    accept: 'accept',
    reject: 'reject',
    terminate: 'terminate',
    preaccept: 'ringing'
})

/** Mutable view of the last connection state, shared with `waitForConnectionUpdate`. */
export interface EventBridgeState {
    connection: 'open' | 'connecting' | 'close'
}

/**
 * Subscribes the Baileys emitter to a zapo-js client and returns the
 * unsubscribe handle. One zapo-js event can fan out to several Baileys ones -
 * a receipt feeds both `message-receipt.update` and `messages.update`, the way
 * upstream does it.
 */
export function bridgeEvents(
    client: WaClient,
    ev: BaileysEventEmitter,
    state: EventBridgeState
): () => void {
    const disposers: (() => void)[] = []

    const onQr = (event: { readonly qr: string; readonly ttlMs: number }): void => {
        state.connection = 'connecting'
        ev.emit('connection.update', { connection: 'connecting', qr: event.qr })
    }
    const onPaired = (): void => {
        ev.emit('creds.update', {})
        ev.emit('connection.update', { isNewLogin: true })
    }
    const onConnection = (event: WaConnectionEvent): void => {
        if (event.status === 'open') {
            state.connection = 'open'
            ev.emit('creds.update', {})
            ev.emit('connection.update', {
                connection: 'open',
                isNewLogin: event.isNewLogin,
                qr: undefined
            })
            return
        }
        state.connection = 'close'
        const statusCode = toDisconnectStatusCode(event.reason, event.isLogout)
        ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: {
                error: createBoomError(event.reason, statusCode, { code: event.code }),
                date: new Date()
            }
        })
    }
    const onOfflineResume = (event: WaOfflineResumeEvent): void => {
        if (event.status !== 'complete') {
            return
        }
        ev.emit('connection.update', { receivedPendingNotifications: true })
    }
    const onMessage = (event: WaIncomingMessageEvent): void => {
        ev.emit('messages.upsert', {
            messages: [toWaMessage(event)],
            type: event.offline === true ? 'append' : 'notify'
        })
    }
    const onAddon = (event: WaIncomingAddonEvent): void => {
        const targetKey: WAMessageKey = {
            remoteJid: event.key.remoteJid,
            id: event.targetMessageId,
            fromMe: event.key.fromMe,
            participant: event.key.participant
        }
        if (event.decrypted.kind === 'reaction') {
            ev.emit('messages.reaction', [{ key: targetKey, reaction: event.decrypted.reaction }])
            return
        }
        if (event.decrypted.kind === 'message_edit') {
            ev.emit('messages.update', [
                { key: targetKey, update: { message: event.decrypted.message } }
            ])
        }
    }
    const onProtocolMessage = (event: WaIncomingProtocolMessageEvent): void => {
        if (event.protocolMessage.type !== proto.Message.ProtocolMessage.Type.REVOKE) {
            return
        }
        const revoked = event.protocolMessage.key
        if (!revoked?.id) {
            return
        }
        ev.emit('messages.update', [
            {
                key: {
                    remoteJid: revoked.remoteJid ?? event.key.remoteJid,
                    id: revoked.id,
                    fromMe: revoked.fromMe ?? false,
                    participant: revoked.participant ?? undefined
                },
                update: { message: null, messageStubType: proto.WebMessageInfo.StubType.REVOKE }
            }
        ])
    }
    const onReceipt = (event: WaIncomingReceiptEvent): void => {
        const remoteJid = event.chatJid
        if (!remoteJid) {
            return
        }
        const nowSeconds = Math.floor(Date.now() / 1_000)
        ev.emit(
            'message-receipt.update',
            event.messageIds.map((id) => ({
                key: { remoteJid, id, fromMe: true, participant: event.participantJid },
                receipt: {
                    userJid: event.participantJid ?? remoteJid,
                    receiptTimestamp: event.status === 'delivered' ? nowSeconds : undefined,
                    readTimestamp: event.status === 'read' ? nowSeconds : undefined,
                    playedTimestamp: event.status === 'played' ? nowSeconds : undefined
                }
            }))
        )
        const status = RECEIPT_STATUS[event.status]
        if (status === undefined) {
            return
        }
        ev.emit(
            'messages.update',
            event.messageIds.map((id) => ({
                key: { remoteJid, id, fromMe: true, participant: event.participantJid },
                update: { status }
            }))
        )
    }
    const onPresence = (event: WaIncomingPresenceEvent): void => {
        const id = event.chatJid
        if (!id) {
            return
        }
        const lastSeen =
            event.lastSeen?.kind === 'timestamp' ? event.lastSeen.unixSeconds : undefined
        ev.emit('presence.update', {
            id,
            presences: { [id]: { lastKnownPresence: event.type, lastSeen } }
        })
    }
    const onChatstate = (event: WaIncomingChatstateEvent): void => {
        const id = event.chatJid
        const lastKnownPresence = CHATSTATE_PRESENCE[event.state]
        if (!id || lastKnownPresence === undefined) {
            return
        }
        const participant = event.participantJid ?? id
        ev.emit('presence.update', { id, presences: { [participant]: { lastKnownPresence } } })
    }
    const onCall = (event: WaIncomingCallEvent): void => {
        const status = CALL_STATUS[event.type]
        if (status === undefined || !event.callId) {
            return
        }
        const from = event.callCreatorJid ?? event.chatJid ?? ''
        ev.emit('call', [
            {
                chatId: event.groupJid ?? from,
                from,
                id: event.callId,
                isVideo: event.isVideo,
                isGroup: event.groupJid !== undefined,
                groupJid: event.groupJid,
                date: new Date((event.timestampSeconds ?? Date.now() / 1_000) * 1_000),
                offline: event.offline === true,
                status
            }
        ])
    }
    const onGroup = (event: WaGroupEvent): void => {
        const id = event.groupJid ?? event.chatJid
        if (!id) {
            return
        }
        const participantAction = PARTICIPANT_ACTIONS[event.action]
        if (participantAction !== undefined) {
            const participants = (event.participants ?? [])
                .map((participant) => participant.jid)
                .filter((jid): jid is string => jid !== undefined)
            ev.emit('group-participants.update', {
                id,
                author: event.authorJid ?? '',
                participants,
                action: participantAction
            })
            return
        }
        switch (event.action) {
            case 'subject':
                ev.emit('groups.update', [{ id, subject: event.subject }])
                return
            case 'description':
                ev.emit('groups.update', [{ id, desc: event.description }])
                return
            case 'announce':
                ev.emit('groups.update', [{ id, announce: event.enabled === true }])
                return
            case 'restrict':
                ev.emit('groups.update', [{ id, restrict: event.enabled === true }])
                return
            case 'ephemeral':
                ev.emit('groups.update', [{ id, ephemeralDuration: event.expirationSeconds ?? 0 }])
                return
            case 'membership_approval_mode':
                ev.emit('groups.update', [{ id, joinApprovalMode: event.enabled === true }])
                return
            default:
                ev.emit('groups.update', [{ id }])
        }
    }
    const onBlocklist = (event: WaBlocklistResult): void => {
        ev.emit('blocklist.set', { blocklist: [...event.jids] })
    }
    const onMutation = (event: WaAppStateMutationEvent): void => {
        emitMutation(ev, event)
    }

    client.on('auth_qr', onQr)
    client.on('auth_paired', onPaired)
    client.on('connection', onConnection)
    client.on('offline_resume', onOfflineResume)
    client.on('message', onMessage)
    client.on('message_addon', onAddon)
    client.on('message_protocol', onProtocolMessage)
    client.on('receipt', onReceipt)
    client.on('presence', onPresence)
    client.on('chatstate', onChatstate)
    client.on('call', onCall)
    client.on('group', onGroup)
    client.on('blocklist', onBlocklist)
    client.on('mutation', onMutation)

    disposers.push(
        () => client.off('auth_qr', onQr),
        () => client.off('auth_paired', onPaired),
        () => client.off('connection', onConnection),
        () => client.off('offline_resume', onOfflineResume),
        () => client.off('message', onMessage),
        () => client.off('message_addon', onAddon),
        () => client.off('message_protocol', onProtocolMessage),
        () => client.off('receipt', onReceipt),
        () => client.off('presence', onPresence),
        () => client.off('chatstate', onChatstate),
        () => client.off('call', onCall),
        () => client.off('group', onGroup),
        () => client.off('blocklist', onBlocklist),
        () => client.off('mutation', onMutation)
    )

    return () => {
        for (const dispose of disposers) {
            dispose()
        }
        disposers.length = 0
    }
}

function emitMutation(ev: BaileysEventEmitter, event: Record<string, unknown>): void {
    const schema = event.schema
    const chatJid = event.chatJid
    const removed = event.operation === 'remove'

    if (typeof chatJid === 'string') {
        switch (schema) {
            case 'Archive':
                ev.emit('chats.update', [
                    { id: chatJid, archived: !removed && event.archived === true }
                ])
                return
            case 'Pin':
                ev.emit('chats.update', [{ id: chatJid, pinned: event.pinned === true ? 1 : 0 }])
                return
            case 'Mute':
                ev.emit('chats.update', [
                    { id: chatJid, muteEndTime: asNumberOrUndefined(event.muteEndTimestamp) }
                ])
                return
            case 'MarkChatAsRead':
                ev.emit('chats.update', [
                    { id: chatJid, unreadCount: event.read === true ? 0 : -1 }
                ])
                return
            case 'DeleteChat':
                ev.emit('chats.delete', [chatJid])
                return
            default:
                break
        }
    }

    if (schema === 'Contact' && typeof event.contactJid === 'string') {
        const contact: Partial<Contact> = { id: event.contactJid }
        if (typeof event.fullName === 'string') {
            contact.name = event.fullName
        }
        ev.emit('contacts.update', [contact])
    }
}

function asNumberOrUndefined(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return value
    }
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
}
