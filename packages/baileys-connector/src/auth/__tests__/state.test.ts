import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { WaStore } from 'zapo-js/store'

import { resolveClientOptions } from '../../socket/config'
import { makeCacheableSignalKeyStore, readZapoBinding, useZapoAuthState } from '../state'

const STORE = { session: () => ({}) } as unknown as WaStore

test('useZapoAuthState tags the state with the store binding', () => {
    const { state } = useZapoAuthState({ store: STORE, sessionId: 'acct-1' })
    assert.deepEqual(readZapoBinding(state), { store: STORE, sessionId: 'acct-1' })
    assert.equal(state.creds.registered, false)
})

test('saveCreds is a no-op because zapo-js persists on its own', async () => {
    const { saveCreds } = useZapoAuthState({ store: STORE, sessionId: 'acct-1' })
    assert.equal(await saveCreds(), undefined)
})

test('the signal key placeholder reads empty and drops writes', async () => {
    const { state } = useZapoAuthState({ store: STORE, sessionId: 'acct-1' })
    const keys = makeCacheableSignalKeyStore(state.keys)
    assert.deepEqual(await keys.get('session', ['a']), {})
    assert.equal(await keys.set({ session: { a: null } }), undefined)
})

test('a foreign auth state is rejected with a migration hint', () => {
    assert.throws(
        () => resolveClientOptions({ auth: { creds: { registered: true }, keys: state().keys } }),
        /useMultiFileAuthState\(\)/
    )
})

test('the socket config maps browser, version and timeouts onto client options', () => {
    const { state: authState } = useZapoAuthState({ store: STORE, sessionId: 'acct-1' })
    const { options, sessionId } = resolveClientOptions({
        auth: authState,
        browser: ['Ubuntu', 'Chrome', '22.04.4'],
        version: [2, 3000, 1_027_000_000],
        connectTimeoutMs: 15_000,
        defaultQueryTimeoutMs: 30_000,
        syncFullHistory: true
    })
    assert.equal(sessionId, 'acct-1')
    assert.equal(options.store, STORE)
    assert.equal(options.deviceBrowser, 'Chrome')
    assert.equal(options.deviceOsDisplayName, 'Ubuntu')
    assert.equal(options.deviceOsVersion, '22.04.4')
    assert.equal(options.version, '2.3000.1027000000')
    assert.equal(options.connectTimeoutMs, 15_000)
    assert.equal(options.nodeQueryTimeoutMs, 30_000)
    assert.deepEqual(options.history, { enabled: true, requireFullSync: true })
})

test('sessionId on the config overrides the one bound to the auth state', () => {
    const { state: authState } = useZapoAuthState({ store: STORE, sessionId: 'acct-1' })
    const { sessionId } = resolveClientOptions({ auth: authState, sessionId: 'acct-2' })
    assert.equal(sessionId, 'acct-2')
})

function state() {
    return useZapoAuthState({ store: STORE, sessionId: 'x' }).state
}
