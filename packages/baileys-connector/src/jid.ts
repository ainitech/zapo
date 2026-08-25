import {
    isBroadcastJid,
    isGroupJid,
    isLidJid,
    isNewsletterJid,
    isStatusBroadcastJid,
    isUserJid,
    parseSignalAddressFromJid,
    toUserJid
} from 'zapo-js/protocol'

import { S_WHATSAPP_NET } from './constants'

export interface FullJid {
    server: string
    user: string
    domainType?: number
    device?: number
}

const DOMAIN_TYPES: Readonly<Record<string, number>> = Object.freeze({
    's.whatsapp.net': 0,
    lid: 1
})

/** Baileys' `jidEncode`. A nullish `user` yields the bare `@server` form. */
export function jidEncode(
    user: string | number | null,
    server: string,
    device?: number,
    agent?: number
): string {
    const base = user ?? ''
    const agentPart = agent !== undefined && agent !== 0 ? `_${agent}` : ''
    const devicePart = device !== undefined && device !== 0 ? `:${device}` : ''
    return `${base}${agentPart}${devicePart}@${server}`
}

/** Baileys' `jidDecode`. Returns `undefined` for anything that is not a JID. */
export function jidDecode(jid: string | undefined): FullJid | undefined {
    if (typeof jid !== 'string') {
        return undefined
    }
    const separator = jid.indexOf('@')
    if (separator < 0) {
        return undefined
    }
    let address
    try {
        address = parseSignalAddressFromJid(jid)
    } catch {
        const server = jid.slice(separator + 1)
        return { server, user: jid.slice(0, separator), device: 0 }
    }
    const server = address.server ?? S_WHATSAPP_NET.slice(1)
    return {
        server,
        user: address.user,
        device: address.device,
        domainType: DOMAIN_TYPES[server] ?? 0
    }
}

/** Strips the `:device` segment, returning the bare `user@server` form. */
export function jidNormalizedUser(jid: string | undefined): string {
    if (!jid) {
        return ''
    }
    try {
        return toUserJid(jid)
    } catch {
        return jid
    }
}

/**
 * True when both JIDs resolve to the same account, ignoring the device
 * segment. Note that a phone JID and its `@lid` counterpart are different
 * users here, exactly as upstream Baileys treats them.
 */
export function areJidsSameUser(jid: string | undefined, other: string | undefined): boolean {
    if (!jid || !other) {
        return false
    }
    return jidNormalizedUser(jid) === jidNormalizedUser(other)
}

export function isJidUser(jid: string | undefined): boolean {
    return jid !== undefined && isUserJid(jid)
}

export function isLidUser(jid: string | undefined): boolean {
    return jid !== undefined && isLidJid(jid)
}

export function isJidGroup(jid: string | undefined): boolean {
    return jid !== undefined && isGroupJid(jid)
}

export function isJidBroadcast(jid: string | undefined): boolean {
    return jid !== undefined && isBroadcastJid(jid)
}

export function isJidStatusBroadcast(jid: string | undefined): boolean {
    return jid !== undefined && isStatusBroadcastJid(jid)
}

export function isJidNewsletter(jid: string | undefined): boolean {
    return jid !== undefined && isNewsletterJid(jid)
}
