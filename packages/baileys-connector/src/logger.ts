import { ConsoleLogger, type Logger, type LogLevel } from 'zapo-js'

/**
 * The pino-shaped logger Baileys accepts: `(mergingObject, message)` per level
 * plus `child(bindings)`.
 */
export interface BaileysLogger {
    level?: string
    trace(context: unknown, message?: string): void
    debug(context: unknown, message?: string): void
    info(context: unknown, message?: string): void
    warn(context: unknown, message?: string): void
    error(context: unknown, message?: string): void
    child(bindings: Record<string, unknown>): BaileysLogger
}

const LEVELS: readonly LogLevel[] = Object.freeze(['trace', 'debug', 'info', 'warn', 'error'])

function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

function isZapoLogger(value: unknown): value is Logger {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Logger).child === 'function' &&
        isLogLevel((value as Logger).level)
    )
}

function isBaileysLogger(value: unknown): value is BaileysLogger {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as BaileysLogger).info === 'function' &&
        typeof (value as BaileysLogger).child === 'function'
    )
}

class BaileysLoggerAdapter implements Logger {
    public readonly level: LogLevel

    public constructor(
        private readonly target: BaileysLogger,
        private readonly bindings: Readonly<Record<string, unknown>> = {}
    ) {
        this.level = isLogLevel(target.level) ? target.level : 'info'
    }

    public trace(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.target.trace(this.merge(context), message)
    }

    public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.target.debug(this.merge(context), message)
    }

    public info(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.target.info(this.merge(context), message)
    }

    public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.target.warn(this.merge(context), message)
    }

    public error(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.target.error(this.merge(context), message)
    }

    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        return new BaileysLoggerAdapter(this.target, { ...this.bindings, ...bindings })
    }

    private merge(context?: Readonly<Record<string, unknown>>): Record<string, unknown> {
        return { ...this.bindings, ...context }
    }
}

/**
 * Normalizes whatever the application passed as `logger` into the structured
 * `Logger` zapo-js expects. A zapo-js logger passes through, a pino-shaped one
 * (what Baileys apps hand over) gets adapted, and anything else falls back to
 * a `ConsoleLogger`.
 */
export function resolveLogger(logger: unknown): Logger {
    if (isZapoLogger(logger)) {
        return logger
    }
    if (isBaileysLogger(logger)) {
        return new BaileysLoggerAdapter(logger)
    }
    return new ConsoleLogger('info')
}
