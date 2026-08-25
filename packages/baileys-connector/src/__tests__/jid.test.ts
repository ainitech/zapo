import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DisconnectReason, toDisconnectStatusCode } from '../constants'
import { createBoomError } from '../errors'
import {
    areJidsSameUser,
    isJidBroadcast,
    isJidGroup,
    isJidUser,
    isLidUser,
    jidDecode,
    jidEncode,
    jidNormalizedUser
} from '../jid'

test('jidEncode builds the device and agent segments the way baileys does', () => {
    assert.equal(jidEncode('5511999999999', 's.whatsapp.net'), '5511999999999@s.whatsapp.net')
    assert.equal(jidEncode('5511999999999', 's.whatsapp.net', 3), '5511999999999:3@s.whatsapp.net')
    assert.equal(jidEncode(null, 'g.us'), '@g.us')
})

test('jidDecode splits user, server and device', () => {
    assert.deepEqual(jidDecode('5511999999999:12@s.whatsapp.net'), {
        server: 's.whatsapp.net',
        user: '5511999999999',
        device: 12,
        domainType: 0
    })
    assert.equal(jidDecode('not-a-jid'), undefined)
    assert.equal(jidDecode(undefined), undefined)
})

test('jidNormalizedUser strips the device segment', () => {
    assert.equal(
        jidNormalizedUser('5511999999999:7@s.whatsapp.net'),
        '5511999999999@s.whatsapp.net'
    )
    assert.equal(jidNormalizedUser(undefined), '')
})

test('areJidsSameUser ignores devices but not addressing mode', () => {
    assert.equal(
        areJidsSameUser('5511999999999:1@s.whatsapp.net', '5511999999999:9@s.whatsapp.net'),
        true
    )
    assert.equal(areJidsSameUser('123@lid', '123@s.whatsapp.net'), false)
    assert.equal(areJidsSameUser(undefined, '123@lid'), false)
})

test('jid predicates classify each server', () => {
    assert.equal(isJidUser('5511999999999@s.whatsapp.net'), true)
    assert.equal(isJidGroup('12345-67890@g.us'), true)
    assert.equal(isJidBroadcast('status@broadcast'), true)
    assert.equal(isLidUser('123@lid'), true)
    assert.equal(isJidUser('12345-67890@g.us'), false)
})

test('a logout close maps to loggedOut regardless of the reason', () => {
    assert.equal(toDisconnectStatusCode('stream_error_replaced', true), DisconnectReason.loggedOut)
    assert.equal(
        toDisconnectStatusCode('stream_error_replaced', false),
        DisconnectReason.connectionReplaced
    )
    assert.equal(toDisconnectStatusCode('comms_stopped', false), DisconnectReason.connectionLost)
})

test('createBoomError exposes the statusCode apps branch on', () => {
    const error = createBoomError('device removed', DisconnectReason.loggedOut)
    assert.equal(error.isBoom, true)
    assert.equal(error.output.statusCode, 401)
    assert.equal(error.output.payload.message, 'device removed')
    assert.ok(error instanceof Error)
})
