import type { WaClientOptions } from 'zapo-js'

import { readZapoBinding } from '../auth/state'
import { resolveLogger } from '../logger'
import type { AuthenticationState, WABrowserDescription, WAVersion } from '../types'

/**
 * The `makeWASocket` config. It is Baileys' `UserFacingSocketConfig` minus the
 * options that only made sense for its own internals; anything not listed is
 * accepted and ignored so existing call sites keep compiling (see the README
 * compatibility matrix for what is dropped).
 */
export interface WASocketConfig {
    /** Auth state from `useMultiFileAuthState` / `useZapoAuthState`. Required. */
    auth: AuthenticationState
    /** A zapo-js `Logger` or a pino-shaped one; anything else falls back to a console logger. */
    logger?: unknown
    browser?: WABrowserDescription
    version?: WAVersion
    connectTimeoutMs?: number
    keepAliveIntervalMs?: number
    defaultQueryTimeoutMs?: number
    markOnlineOnConnect?: boolean
    syncFullHistory?: boolean
    generateHighQualityLinkPreview?: boolean
    shouldIgnoreJid?: (jid: string) => boolean | undefined
    /** Session key inside the store when several accounts share one auth state. */
    sessionId?: string
    /** Escape hatch: merged last into the `WaClientOptions` handed to `WaClient`. */
    zapo?: Partial<WaClientOptions>
    [option: string]: unknown
}

export interface ResolvedClientOptions {
    readonly options: WaClientOptions
    readonly sessionId: string
}

function toVersionString(version: WAVersion | undefined): string | undefined {
    if (!version) {
        return undefined
    }
    return version.join('.')
}

/**
 * Translates the Baileys socket config into `WaClientOptions`.
 *
 * @throws when `auth` is missing or was not produced by this package - an
 * upstream Baileys auth folder carries signal records zapo-js cannot read.
 */
export function resolveClientOptions(config: WASocketConfig): ResolvedClientOptions {
    const binding = readZapoBinding(config.auth)
    if (!binding) {
        throw new Error(
            'makeWASocket requires an auth state built by @zapo-js/baileys-connector. ' +
                'Use useMultiFileAuthState() or useZapoAuthState({ store, sessionId }); ' +
                'an existing @whiskeysockets/baileys auth folder cannot be reused.'
        )
    }

    const sessionId = config.sessionId ?? binding.sessionId
    const [osName, browserName, osVersion] = config.browser ?? []

    const options: WaClientOptions = {
        store: binding.store,
        sessionId,
        deviceBrowser: browserName,
        deviceOsDisplayName: osName,
        deviceOsVersion: osVersion,
        version: toVersionString(config.version),
        connectTimeoutMs: config.connectTimeoutMs,
        keepAliveIntervalMs: config.keepAliveIntervalMs,
        nodeQueryTimeoutMs: config.defaultQueryTimeoutMs,
        iqTimeoutMs: config.defaultQueryTimeoutMs,
        markOnlineOnConnect: config.markOnlineOnConnect,
        history:
            config.syncFullHistory === undefined
                ? undefined
                : { enabled: true, requireFullSync: config.syncFullHistory },
        linkPreview:
            config.generateHighQualityLinkPreview === undefined
                ? undefined
                : { uploadHqThumbnail: config.generateHighQualityLinkPreview },
        ...config.zapo
    }

    return { options, sessionId }
}

export function resolveSocketLogger(config: WASocketConfig): ReturnType<typeof resolveLogger> {
    return resolveLogger(config.logger)
}
