/**
 * The `output.payload.statusCode` shape Baileys inherits from `@hapi/boom`.
 * Applications routinely read `(lastDisconnect.error as Boom).output.statusCode`,
 * so the connector reproduces the structure without pulling in Boom itself.
 */
export interface BoomLikeError extends Error {
    readonly isBoom: true
    readonly output: {
        readonly statusCode: number
        readonly payload: {
            readonly statusCode: number
            readonly error: string
            readonly message: string
        }
        readonly headers: Readonly<Record<string, string>>
    }
    readonly data?: unknown
}

const STATUS_TEXT: Readonly<Record<number, string>> = Object.freeze({
    401: 'Unauthorized',
    403: 'Forbidden',
    405: 'Method Not Allowed',
    408: 'Request Time-out',
    411: 'Length Required',
    428: 'Precondition Required',
    440: 'Login Time-out',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
    515: 'Restart Required'
})

/** Builds the Boom-shaped error Baileys puts on `connection.update.lastDisconnect`. */
export function createBoomError(
    message: string,
    statusCode: number,
    data?: unknown
): BoomLikeError {
    const error = new Error(message) as Error & {
        isBoom: true
        output: BoomLikeError['output']
        data?: unknown
    }
    error.name = 'Error'
    error.isBoom = true
    error.output = {
        statusCode,
        payload: {
            statusCode,
            error: STATUS_TEXT[statusCode] ?? 'Unknown',
            message
        },
        headers: {}
    }
    if (data !== undefined) {
        error.data = data
    }
    return error
}
