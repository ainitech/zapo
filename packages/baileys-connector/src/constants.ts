import { proto } from 'zapo-js/proto'
import { WA_DISCONNECT_REASONS, type WaDisconnectReason } from 'zapo-js/protocol'

import type { WABrowserDescription } from './types'

export const S_WHATSAPP_NET = '@s.whatsapp.net'
export const GROUP_SERVER = '@g.us'
export const BROADCAST_SERVER = '@broadcast'
export const LID_SERVER = '@lid'
export const NEWSLETTER_SERVER = '@newsletter'
export const STATUS_BROADCAST_JID = 'status@broadcast'

/**
 * Baileys' `DisconnectReason`. Declared as a frozen object rather than a TS
 * `enum` (the repository forbids enums), which keeps `DisconnectReason.loggedOut`
 * and the numeric comparisons downstream apps make working unchanged.
 */
export const DisconnectReason = Object.freeze({
    connectionClosed: 428,
    connectionLost: 408,
    connectionReplaced: 440,
    timedOut: 408,
    loggedOut: 401,
    badSession: 500,
    restartRequired: 515,
    multideviceMismatch: 411,
    forbidden: 403,
    unavailableService: 503
} as const)

export type DisconnectReasonCode = (typeof DisconnectReason)[keyof typeof DisconnectReason]

const DISCONNECT_REASON_STATUS: Readonly<Record<WaDisconnectReason, DisconnectReasonCode>> =
    Object.freeze({
        [WA_DISCONNECT_REASONS.CLIENT_DISCONNECTED]: DisconnectReason.connectionClosed,
        [WA_DISCONNECT_REASONS.COMMS_STOPPED]: DisconnectReason.connectionLost,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED]: DisconnectReason.connectionReplaced,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_DEVICE_REMOVED]: DisconnectReason.loggedOut,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_ACK]: DisconnectReason.connectionClosed,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_XML_NOT_WELL_FORMED]: DisconnectReason.connectionClosed,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_OTHER]: DisconnectReason.connectionClosed,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGIN]: DisconnectReason.restartRequired,
        [WA_DISCONNECT_REASONS.STREAM_ERROR_FORCE_LOGOUT]: DisconnectReason.loggedOut,
        [WA_DISCONNECT_REASONS.FAILURE_LOCKED]: DisconnectReason.forbidden,
        [WA_DISCONNECT_REASONS.FAILURE_NOT_AUTHORIZED]: DisconnectReason.loggedOut,
        [WA_DISCONNECT_REASONS.FAILURE_BANNED]: DisconnectReason.forbidden,
        [WA_DISCONNECT_REASONS.FAILURE_CLIENT_TOO_OLD]: DisconnectReason.badSession,
        [WA_DISCONNECT_REASONS.FAILURE_BAD_USER_AGENT]: DisconnectReason.badSession,
        [WA_DISCONNECT_REASONS.FAILURE_SERVICE_UNAVAILABLE]: DisconnectReason.unavailableService,
        [WA_DISCONNECT_REASONS.PRIMARY_IDENTITY_KEY_CHANGE]: DisconnectReason.loggedOut
    })

/**
 * Maps a zapo-js disconnect reason onto the Baileys status code applications
 * compare against. `isLogout` wins: a session the server unlinked always
 * surfaces as `loggedOut`, which is the branch apps use to stop reconnecting.
 */
export function toDisconnectStatusCode(
    reason: WaDisconnectReason,
    isLogout: boolean
): DisconnectReasonCode {
    if (isLogout) {
        return DisconnectReason.loggedOut
    }
    return DISCONNECT_REASON_STATUS[reason] ?? DisconnectReason.connectionClosed
}

export const WAMessageStubType = proto.WebMessageInfo.StubType
export const WAMessageStatus = proto.WebMessageInfo.Status

const PLATFORM_OS_NAMES: Readonly<Record<string, string>> = Object.freeze({
    aix: 'AIX',
    darwin: 'Mac OS',
    freebsd: 'FreeBSD',
    linux: 'Linux',
    openbsd: 'OpenBSD',
    sunos: 'Solaris',
    win32: 'Windows'
})

/**
 * Baileys' `Browsers` helper. Each entry returns the
 * `[os, browser, osVersion]` triple that `makeWASocket({ browser })` accepts.
 */
export const Browsers = Object.freeze({
    ubuntu: (browser: string): WABrowserDescription => ['Ubuntu', browser, '22.04.4'],
    macOS: (browser: string): WABrowserDescription => ['Mac OS', browser, '14.4.1'],
    baileys: (browser: string): WABrowserDescription => ['Baileys', browser, '6.5.0'],
    windows: (browser: string): WABrowserDescription => ['Windows', browser, '10.0.22631'],
    appropriate: (browser: string): WABrowserDescription => [
        PLATFORM_OS_NAMES[process.platform] ?? 'Ubuntu',
        browser,
        process.version.replace(/^v/, '')
    ]
})
