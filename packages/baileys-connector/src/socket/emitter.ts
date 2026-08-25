import { EventEmitter } from 'node:events'

import type { BaileysEvent, BaileysEventEmitter, BaileysEventMap } from '../types'

const ALL_EVENTS: readonly BaileysEvent[] = Object.freeze([
    'connection.update',
    'creds.update',
    'messaging-history.set',
    'chats.upsert',
    'chats.update',
    'chats.delete',
    'presence.update',
    'contacts.upsert',
    'contacts.update',
    'messages.delete',
    'messages.update',
    'messages.upsert',
    'messages.reaction',
    'message-receipt.update',
    'groups.upsert',
    'groups.update',
    'group-participants.update',
    'blocklist.set',
    'blocklist.update',
    'call'
] as const)

/**
 * The `sock.ev` emitter. Upstream Baileys batches events into a buffer that
 * `process()` drains; the connector forwards each event as it arrives, so
 * `process()` is a subscription across the whole map and `buffer()`/`flush()`
 * are inert. Handlers therefore see one key per callback instead of a batch,
 * which is the shape `ev.process` consumers already handle.
 */
export class WaBaileysEventEmitter implements BaileysEventEmitter {
    private readonly emitter = new EventEmitter()

    public constructor(maxListeners = 0) {
        this.emitter.setMaxListeners(maxListeners)
    }

    public on<T extends BaileysEvent>(event: T, listener: (arg: BaileysEventMap[T]) => void): void {
        this.emitter.on(event, listener as (...args: unknown[]) => void)
    }

    public once<T extends BaileysEvent>(
        event: T,
        listener: (arg: BaileysEventMap[T]) => void
    ): void {
        this.emitter.once(event, listener as (...args: unknown[]) => void)
    }

    public off<T extends BaileysEvent>(
        event: T,
        listener: (arg: BaileysEventMap[T]) => void
    ): void {
        this.emitter.off(event, listener as (...args: unknown[]) => void)
    }

    public removeAllListeners<T extends BaileysEvent>(event?: T): void {
        if (event === undefined) {
            this.emitter.removeAllListeners()
            return
        }
        this.emitter.removeAllListeners(event)
    }

    public emit<T extends BaileysEvent>(event: T, arg: BaileysEventMap[T]): boolean {
        return this.emitter.emit(event, arg)
    }

    public process(
        handler: (events: Partial<BaileysEventMap>) => void | Promise<void>
    ): () => void {
        const bound = ALL_EVENTS.map((event) => {
            const listener = (arg: unknown): void => {
                void handler({ [event]: arg })
            }
            this.emitter.on(event, listener)
            return { event, listener }
        })
        return () => {
            for (const entry of bound) {
                this.emitter.off(entry.event, entry.listener)
            }
        }
    }

    public buffer(): void {
        // The connector does not buffer - events are forwarded as they arrive.
    }

    public flush(): boolean {
        return false
    }
}
