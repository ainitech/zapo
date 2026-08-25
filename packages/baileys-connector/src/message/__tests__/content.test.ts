import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readDisappearingToggle, toZapoSend } from '../content'

const QUOTED = {
    key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'ABC', fromMe: false },
    message: { conversation: 'oi' }
}

test('text content maps to the typed text send', async () => {
    const mapped = await toZapoSend({ text: 'hello' })
    assert.deepEqual(mapped.content, {
        type: 'text',
        text: 'hello',
        contextInfo: undefined,
        linkPreview: undefined
    })
})

test('linkPreview: null disables the auto fetch', async () => {
    const mapped = await toZapoSend({ text: 'https://example.com', linkPreview: null })
    assert.equal((mapped.content as { linkPreview?: boolean }).linkPreview, false)
})

test('mentions, messageId and quoted land on the send options', async () => {
    const mapped = await toZapoSend(
        { text: '@5511999999999 ping', mentions: ['5511999999999@s.whatsapp.net'] },
        { messageId: 'CUSTOM', quoted: QUOTED, ephemeralExpiration: 604_800 }
    )
    assert.deepEqual(mapped.options.mentions, ['5511999999999@s.whatsapp.net'])
    assert.equal(mapped.options.id, 'CUSTOM')
    assert.equal(mapped.options.expirationSeconds, 604_800)
    assert.deepEqual(mapped.options.quote, {
        id: 'ABC',
        remoteJid: '5511999999999@s.whatsapp.net',
        participant: undefined,
        message: { conversation: 'oi' }
    })
})

test('image content carries the bytes and caption', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const mapped = await toZapoSend({ image: bytes, caption: 'look', mimetype: 'image/jpeg' })
    const content = mapped.content as { type: string; media: Uint8Array; caption?: string }
    assert.equal(content.type, 'image')
    assert.equal(content.media, bytes)
    assert.equal(content.caption, 'look')
})

test('a video flagged ptv becomes the ptv kind', async () => {
    const mapped = await toZapoSend({
        video: new Uint8Array([1]),
        ptv: true,
        mimetype: 'video/mp4'
    })
    assert.equal((mapped.content as { type: string }).type, 'ptv')
})

test('react maps onto the reaction kind and targets the reacted message', async () => {
    const mapped = await toZapoSend({
        react: { text: '👍', key: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: false } }
    })
    assert.deepEqual(mapped.content, {
        type: 'reaction',
        emoji: '👍',
        target: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: false, participant: undefined }
    })
})

test('delete maps onto revoke', async () => {
    const mapped = await toZapoSend({
        delete: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: true }
    })
    assert.equal((mapped.content as { type: string }).type, 'revoke')
})

test('pin type 2 unpins', async () => {
    const mapped = await toZapoSend({
        pin: { remoteJid: '1@s.whatsapp.net', id: 'X', fromMe: true },
        type: 2,
        time: 86_400
    })
    assert.equal((mapped.content as { type: string }).type, 'unpin')
})

test('poll keeps the option order used for vote hashing', async () => {
    const mapped = await toZapoSend({
        poll: { name: 'lunch?', values: ['pizza', 'sushi'], selectableCount: 1 }
    })
    assert.deepEqual(mapped.content, {
        type: 'poll',
        name: 'lunch?',
        options: ['pizza', 'sushi'],
        selectableCount: 1,
        contextInfo: undefined
    })
})

test('forward sends the source proto with the forward flag', async () => {
    const mapped = await toZapoSend({
        forward: {
            key: { remoteJid: '1@s.whatsapp.net', id: 'X' },
            message: { conversation: 'hi' }
        }
    })
    assert.deepEqual(mapped.content, { conversation: 'hi' })
    assert.equal(mapped.options.forward, true)
})

test('location and a single contact fall back to raw protos', async () => {
    const location = await toZapoSend({ location: { degreesLatitude: 1, degreesLongitude: 2 } })
    assert.deepEqual(location.content, {
        locationMessage: { degreesLatitude: 1, degreesLongitude: 2 }
    })

    const contact = await toZapoSend({
        contacts: { contacts: [{ displayName: 'x', vcard: 'BEGIN:VCARD' }] }
    })
    assert.deepEqual(contact.content, {
        contactMessage: { displayName: 'x', vcard: 'BEGIN:VCARD' }
    })
})

test('an unmapped content shape reports its keys', async () => {
    await assert.rejects(
        () => toZapoSend({ somethingElse: true } as never),
        /no mapping for keys \[somethingElse\]/
    )
})

test('readDisappearingToggle recognizes the group ephemeral pseudo-content', () => {
    assert.equal(readDisappearingToggle({ disappearingMessagesInChat: true }), 604_800)
    assert.equal(readDisappearingToggle({ disappearingMessagesInChat: false }), 0)
    assert.equal(readDisappearingToggle({ disappearingMessagesInChat: 86_400 }), 86_400)
    assert.equal(readDisappearingToggle({ text: 'hi' }), null)
})
