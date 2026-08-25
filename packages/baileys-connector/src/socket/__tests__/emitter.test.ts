import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WaBaileysEventEmitter } from '../emitter'

test('process receives one key per forwarded event', () => {
    const ev = new WaBaileysEventEmitter()
    const batches: unknown[] = []
    const stop = ev.process((events) => {
        batches.push(events)
    })

    ev.emit('connection.update', { connection: 'open' })
    ev.emit('chats.delete', ['1@s.whatsapp.net'])

    assert.deepEqual(batches, [
        { 'connection.update': { connection: 'open' } },
        { 'chats.delete': ['1@s.whatsapp.net'] }
    ])

    stop()
    ev.emit('connection.update', { connection: 'close' })
    assert.equal(batches.length, 2)
})

test('off removes a single listener and removeAllListeners clears the event', () => {
    const ev = new WaBaileysEventEmitter()
    let hits = 0
    const listener = (): void => {
        hits += 1
    }
    ev.on('chats.delete', listener)
    ev.emit('chats.delete', ['a'])
    ev.off('chats.delete', listener)
    ev.emit('chats.delete', ['b'])
    assert.equal(hits, 1)

    ev.on('chats.delete', listener)
    ev.removeAllListeners('chats.delete')
    ev.emit('chats.delete', ['c'])
    assert.equal(hits, 1)
})

test('buffer and flush are inert', () => {
    const ev = new WaBaileysEventEmitter()
    const seen: unknown[] = []
    ev.on('chats.delete', (payload) => seen.push(payload))
    ev.buffer()
    ev.emit('chats.delete', ['a'])
    assert.deepEqual(seen, [['a']])
    assert.equal(ev.flush(), false)
})
