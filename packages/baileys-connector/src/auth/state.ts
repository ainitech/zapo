import type { WaStore } from 'zapo-js/store'

import type { AuthenticationCreds, AuthenticationState, SignalKeyStore } from '../types'

/**
 * Marker attached to every auth state this package produces. `makeWASocket`
 * reads it to recover the zapo-js store, and refuses states it did not build
 * (an upstream Baileys folder cannot be replayed - see the package README).
 */
export const ZAPO_AUTH_STATE = Symbol.for('@zapo-js/baileys-connector.auth-state')

export interface ZapoAuthBinding {
    readonly store: WaStore
    readonly sessionId: string
}

export interface ZapoAuthState extends AuthenticationState {
    readonly [ZAPO_AUTH_STATE]: ZapoAuthBinding
}

/**
 * Placeholder for Baileys' `SignalKeyStore`. Signal material (sessions,
 * pre-keys, sender keys, app-state keys) lives inside the zapo-js store and is
 * never mirrored here, so reads come back empty and writes are dropped.
 */
const NOOP_SIGNAL_KEYS: SignalKeyStore = Object.freeze({
    get: () => Promise.resolve({}),
    set: () => Promise.resolve(),
    clear: () => Promise.resolve()
})

export function createEmptyCreds(): AuthenticationCreds {
    return { registered: false }
}

/**
 * Wraps an existing zapo-js store as a Baileys-shaped auth state. Use this when
 * the application already builds its own store (MySQL, Postgres, Redis, Mongo,
 * SQLite) instead of the file-backed {@link useMultiFileAuthState} helper.
 *
 * @example
 * ```ts
 * const store = createStore({ backends: { mysql }, providers: { auth: 'mysql', ... } })
 * const { state, saveCreds } = useZapoAuthState({ store, sessionId: 'default' })
 * const sock = makeWASocket({ auth: state })
 * sock.ev.on('creds.update', saveCreds)
 * ```
 */
export function useZapoAuthState(binding: ZapoAuthBinding): {
    state: ZapoAuthState
    saveCreds: () => Promise<void>
} {
    const state = {
        creds: createEmptyCreds(),
        keys: NOOP_SIGNAL_KEYS,
        [ZAPO_AUTH_STATE]: binding
    } as ZapoAuthState
    // zapo-js writes credentials to the store as they change, so there is
    // nothing to flush here. Kept so `ev.on('creds.update', saveCreds)` works.
    return { state, saveCreds: () => Promise.resolve() }
}

/** Narrows an arbitrary auth state to one this package produced. */
export function readZapoBinding(state: AuthenticationState | undefined): ZapoAuthBinding | null {
    if (!state) {
        return null
    }
    const binding = (state as Partial<ZapoAuthState>)[ZAPO_AUTH_STATE]
    return binding ?? null
}

/**
 * Baileys' `makeCacheableSignalKeyStore`. zapo-js already caches signal reads
 * inside its store layer, so the wrapper is the identity function and exists
 * only so existing call sites keep compiling.
 */
export function makeCacheableSignalKeyStore(keys: SignalKeyStore): SignalKeyStore {
    return keys
}
