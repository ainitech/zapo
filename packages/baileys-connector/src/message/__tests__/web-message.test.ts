import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { WaIncomingMessageEvent } from 'zapo-js'

import { buildSentWaMessage, toWaMessage } from '../web-message'

const EVENT = {
    key: {
        remoteJid: '123-456@g.us',
        id: 'MSG1',
        fromMe: false,
        participant: '5511999999999@s.whatsapp.net',
        participantAlt: '111@lid',
        remoteJidAlt: undefined,
        isGroup: true,
        isBroadcast: false,
        isNewsletter: false,
        senderDevice: 0
    },
    message: { conversation: 'ping' },
    timestampSeconds: 1_700_000_000,
    pushName: 'Rafael',
    rawNode: {}
} as unknown as WaIncomingMessageEvent

test('toWaMessage rebuilds the web-message envelope from the stanza', () => {
    const message = toWaMessage(EVENT)
    assert.deepEqual(message.key, {
        remoteJid: '123-456@g.us',
        id: 'MSG1',
        fromMe: false,
        participant: '5511999999999@s.whatsapp.net',
        senderLid: '111@lid',
        senderPn: undefined
    })
    assert.deepEqual(message.message, { conversation: 'ping' })
    assert.equal(message.messageTimestamp, 1_700_000_000)
    assert.equal(message.pushName, 'Rafael')
    assert.equal(message.broadcast, false)
})

test('buildSentWaMessage marks the envelope as ours', () => {
    const message = buildSentWaMessage({
        remoteJid: '1@s.whatsapp.net',
        id: 'OUT1',
        meJid: '5511999999999@s.whatsapp.net',
        message: { conversation: 'pong' },
        timestampSeconds: 42
    })
    assert.equal(message.key.fromMe, true)
    assert.equal(message.key.id, 'OUT1')
    assert.equal(message.messageTimestamp, 42)
})
