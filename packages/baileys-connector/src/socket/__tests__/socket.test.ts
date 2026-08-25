import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import { createStore } from 'zapo-js/store'

import { useZapoAuthState } from '../../auth/state'
import { makeWASocket } from '../makeWASocket'

test('makeWASocket exposes the baileys surface and closes cleanly', async () => {
    const store = createStore({})
    const { state, saveCreds } = useZapoAuthState({ store, sessionId: 'unit' })
    const sock = makeWASocket({ auth: state, logger: createNoopLogger() })

    try {
        assert.equal(sock.type, 'md')
        assert.equal(typeof sock.sendMessage, 'function')
        assert.equal(typeof sock.groupMetadata, 'function')
        assert.equal(typeof sock.onWhatsApp, 'function')
        assert.equal(typeof sock.chatModify, 'function')
        assert.equal(typeof sock.ev.process, 'function')
        assert.match(sock.generateMessageTag(), /^[0-9A-F]{16}$/)
        assert.equal(sock.authState.creds, state.creds)
        assert.equal(await saveCreds(), undefined)
    } finally {
        await sock.end()
        await store.destroy()
    }
})

test('makeWASocket rejects an auth state it did not build', () => {
    assert.throws(
        () =>
            makeWASocket({
                auth: {
                    creds: { registered: false },
                    keys: { get: () => Promise.resolve({}), set: () => Promise.resolve() }
                }
            }),
        /useMultiFileAuthState/
    )
})
