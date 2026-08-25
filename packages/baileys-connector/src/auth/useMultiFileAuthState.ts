import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { createStore, type WaStoreBackend } from 'zapo-js/store'

import { useZapoAuthState, type ZapoAuthState } from './state'

interface SqliteStoreModule {
    createSqliteStore(config: { path: string; driver?: 'auto' }): WaStoreBackend
}

const SQLITE_FILE_NAME = 'zapo-state.sqlite'
// Widened to `string` on purpose: it stops TypeScript from resolving the
// specifier at build time, which it cannot do for an optional peer that is
// legitimately absent from the compile.
// eslint-disable-next-line @typescript-eslint/no-inferrable-types
const SQLITE_MODULE_ID: string = '@zapo-js/store-sqlite'
const MISSING_SQLITE_MESSAGE =
    'useMultiFileAuthState needs the optional peer "@zapo-js/store-sqlite". ' +
    'Install it (npm i @zapo-js/store-sqlite better-sqlite3), or build your own ' +
    'zapo-js store and pass it to useZapoAuthState({ store, sessionId }).'

async function loadSqliteBackend(path: string): Promise<WaStoreBackend> {
    let loaded: unknown
    try {
        loaded = await import(SQLITE_MODULE_ID)
    } catch {
        throw new Error(MISSING_SQLITE_MESSAGE)
    }
    const module = loaded as SqliteStoreModule
    return module.createSqliteStore({ path, driver: 'auto' })
}

export interface UseMultiFileAuthStateResult {
    state: ZapoAuthState
    saveCreds: () => Promise<void>
}

/**
 * Baileys' `useMultiFileAuthState`, backed by zapo-js. The folder still owns
 * the session, but instead of one JSON file per signal key it holds a single
 * `zapo-state.sqlite` written by `@zapo-js/store-sqlite`.
 *
 * **Existing Baileys folders are not migrated.** The signal session records use
 * different on-disk representations, so a session that was paired against
 * upstream Baileys has to be linked again (a fresh QR / pairing code) the first
 * time it runs through the connector.
 *
 * @param folder Directory to persist the session in. Created if missing.
 * @param sessionId Session key inside the store, for holding several accounts
 * in one folder. Defaults to `'default'`.
 * @throws when the optional `@zapo-js/store-sqlite` peer is not installed.
 * @example
 * ```ts
 * const { state, saveCreds } = await useMultiFileAuthState('./auth')
 * const sock = makeWASocket({ auth: state })
 * sock.ev.on('creds.update', saveCreds)
 * ```
 */
export async function useMultiFileAuthState(
    folder: string,
    sessionId = 'default'
): Promise<UseMultiFileAuthStateResult> {
    const directory = isAbsolute(folder) ? folder : resolve(process.cwd(), folder)
    await mkdir(directory, { recursive: true })

    const sqlite = await loadSqliteBackend(join(directory, SQLITE_FILE_NAME))
    const store = createStore({
        backends: { sqlite },
        providers: {
            auth: 'sqlite',
            signal: 'sqlite',
            preKey: 'sqlite',
            session: 'sqlite',
            identity: 'sqlite',
            senderKey: 'sqlite',
            appState: 'sqlite',
            privacyToken: 'sqlite',
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite'
        }
    })

    return useZapoAuthState({ store, sessionId })
}
