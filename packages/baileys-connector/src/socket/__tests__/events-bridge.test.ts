import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import type { WaClient } from 'zapo-js'
import { proto } from 'zapo-js/proto'

import type { BaileysEvent, BaileysEventMap } from '../../types'
import { WaBaileysEventEmitter } from '../emitter'
import { bridgeEvents, type EventBridgeState } from '../events-bridge'

function setup(): {
    client: EventEmitter
    ev: WaBaileysEventEmitter
    state: EventBridgeState
    captured: <T extends BaileysEvent>(event: T) => BaileysEventMap[T][]
    dispose: () => void
} {
    const client = new EventEmitter()
    const ev = new WaBaileysEventEmitter()
    const state: EventBridgeState = { connection: 'connecting' }
    const seen = new Map<string, unknown[]>()
    const dispose = bridgeEvents(client as unknown as WaClient, ev, state)
    return {
        client,
        ev,
        state,
        captured: <T extends BaileysEvent>(event: T) => {
            const bucket = seen.get(event)
            if (bucket) {
                return bucket as BaileysEventMap[T][]
            }
            const fresh: unknown[] = []
            seen.set(event, fresh)
            ev.on(event, (payload) => {
                fresh.push(payload)
            })
            return fresh as BaileysEventMap[T][]
        },
        dispose
    }
}

const INCOMING_KEY = {
    remoteJid: '5511999999999@s.whatsapp.net',
    id: 'MSG1',
    fromMe: false,
    participant: undefined,
    isGroup: false,
    isBroadcast: false,
    isNewsletter: false,
    senderDevice: 0
}

test('a qr refresh surfaces as a connecting update carrying the code', () => {
    const { client, captured, state } = setup()
    const updates = captured('connection.update')
    client.emit('auth_qr', { qr: 'QR-DATA', ttlMs: 20_000 })
    assert.deepEqual(updates, [{ connection: 'connecting', qr: 'QR-DATA' }])
    assert.equal(state.connection, 'connecting')
})

test('an open connection emits creds.update then the open update', () => {
    const { client, ev, state } = setup()
    const order: string[] = []
    ev.on('creds.update', () => order.push('creds'))
    ev.on('connection.update', () => order.push('connection'))
    client.emit('connection', {
        status: 'open',
        reason: 'connected',
        code: null,
        isLogout: false,
        isNewLogin: true
    })
    assert.deepEqual(order, ['creds', 'connection'])
    assert.equal(state.connection, 'open')
})

test('a logout close carries a boom error with statusCode 401', () => {
    const { client, captured } = setup()
    const updates = captured('connection.update')
    client.emit('connection', {
        status: 'close',
        reason: 'stream_error_device_removed',
        code: null,
        isLogout: true,
        isNewLogin: false
    })
    const update = updates[0]
    assert.equal(update?.connection, 'close')
    const error = update?.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
    assert.equal(error?.output?.statusCode, 401)
})

test('an incoming message becomes a notify upsert', () => {
    const { client, captured } = setup()
    const upserts = captured('messages.upsert')
    client.emit('message', {
        key: INCOMING_KEY,
        message: { conversation: 'ping' },
        timestampSeconds: 1_700_000_000,
        pushName: 'Rafael',
        rawNode: {}
    })
    assert.equal(upserts.length, 1)
    assert.equal(upserts[0]?.type, 'notify')
    assert.equal(upserts[0]?.messages[0]?.key.id, 'MSG1')
    assert.equal(upserts[0]?.messages[0]?.pushName, 'Rafael')
})

test('an offline message becomes an append upsert', () => {
    const { client, captured } = setup()
    const upserts = captured('messages.upsert')
    client.emit('message', { key: INCOMING_KEY, offline: true, rawNode: {} })
    assert.equal(upserts[0]?.type, 'append')
})

test('a decrypted reaction addon targets the parent message', () => {
    const { client, captured } = setup()
    const reactions = captured('messages.reaction')
    client.emit('message_addon', {
        key: { ...INCOMING_KEY, id: 'ADDON1' },
        kind: 'reaction',
        targetMessageId: 'MSG1',
        decrypted: { kind: 'reaction', reaction: { text: '👍' } },
        raw: {}
    })
    assert.equal(reactions[0]?.[0]?.key.id, 'MSG1')
    assert.equal(reactions[0]?.[0]?.reaction.text, '👍')
})

test('a revoke protocol message clears the message and stamps the stub type', () => {
    const { client, captured } = setup()
    const updates = captured('messages.update')
    client.emit('message_protocol', {
        key: INCOMING_KEY,
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.REVOKE,
            key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'GONE', fromMe: false }
        },
        rawNode: {}
    })
    assert.equal(updates[0]?.[0]?.key.id, 'GONE')
    assert.equal(updates[0]?.[0]?.update.message, null)
    assert.equal(updates[0]?.[0]?.update.messageStubType, proto.WebMessageInfo.StubType.REVOKE)
})

test('a read receipt updates both the receipt and the message status', () => {
    const { client, captured } = setup()
    const receipts = captured('message-receipt.update')
    const updates = captured('messages.update')
    client.emit('receipt', {
        chatJid: '5511999999999@s.whatsapp.net',
        status: 'read',
        messageIds: ['A', 'B'],
        fromSelfDevice: false,
        rawNode: {}
    })
    assert.equal(receipts[0]?.length, 2)
    assert.equal(updates[0]?.length, 2)
    assert.equal(updates[0]?.[0]?.update.status, proto.WebMessageInfo.Status.READ)
})

test('a participant add fans out to group-participants.update', () => {
    const { client, captured } = setup()
    const updates = captured('group-participants.update')
    client.emit('group', {
        groupJid: '123-456@g.us',
        authorJid: '5511999999999@s.whatsapp.net',
        action: 'add',
        participants: [{ jid: '1@s.whatsapp.net' }, { jid: '2@s.whatsapp.net' }],
        rawActionNode: {},
        rawNode: {}
    })
    assert.deepEqual(updates[0], {
        id: '123-456@g.us',
        author: '5511999999999@s.whatsapp.net',
        participants: ['1@s.whatsapp.net', '2@s.whatsapp.net'],
        action: 'add'
    })
})

test('a subject change fans out to groups.update', () => {
    const { client, captured } = setup()
    const updates = captured('groups.update')
    client.emit('group', {
        groupJid: '123-456@g.us',
        action: 'subject',
        subject: 'novo nome',
        rawActionNode: {},
        rawNode: {}
    })
    assert.deepEqual(updates[0], [{ id: '123-456@g.us', subject: 'novo nome' }])
})

test('a chatstate becomes a presence update for the participant', () => {
    const { client, captured } = setup()
    const updates = captured('presence.update')
    client.emit('chatstate', {
        chatJid: '123-456@g.us',
        state: 'composing',
        participantJid: '1@s.whatsapp.net',
        rawNode: {}
    })
    assert.deepEqual(updates[0], {
        id: '123-456@g.us',
        presences: { '1@s.whatsapp.net': { lastKnownPresence: 'composing' } }
    })
})

test('an archive mutation becomes a chats.update', () => {
    const { client, captured } = setup()
    const updates = captured('chats.update')
    client.emit('mutation', {
        schema: 'Archive',
        operation: 'set',
        chatJid: '1@s.whatsapp.net',
        archived: true
    })
    assert.deepEqual(updates[0], [{ id: '1@s.whatsapp.net', archived: true }])
})

test('a delete-chat mutation becomes a chats.delete', () => {
    const { client, captured } = setup()
    const deletes = captured('chats.delete')
    client.emit('mutation', {
        schema: 'DeleteChat',
        operation: 'set',
        chatJid: '1@s.whatsapp.net'
    })
    assert.deepEqual(deletes[0], ['1@s.whatsapp.net'])
})

test('disposing the bridge stops forwarding', () => {
    const { client, captured, dispose } = setup()
    const upserts = captured('messages.upsert')
    dispose()
    client.emit('message', { key: INCOMING_KEY, rawNode: {} })
    assert.equal(upserts.length, 0)
})
