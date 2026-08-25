# @zapo-js/baileys-connector

A drop-in `@whiskeysockets/baileys` API surface backed by [`zapo-js`](../../README.md).

The goal is a transparent swap: keep `makeWASocket`, `sock.ev.on('messages.upsert', ...)`,
`sock.sendMessage(jid, content)` and the rest of the Baileys call shapes in your
application, while the protocol work underneath is done by zapo-js.

---

## Install

```bash
npm i zapo-js @zapo-js/baileys-connector
# only if you use useMultiFileAuthState():
npm i @zapo-js/store-sqlite better-sqlite3
```

Then point the Baileys specifier at the connector, so no import in your app changes:

```jsonc
{
    "dependencies": {
        // before
        // "@whiskeysockets/baileys": "git+https://<token>@github.com/ainitech/btnbtn11",

        // after
        "@whiskeysockets/baileys": "npm:@zapo-js/baileys-connector@^1.0.0",
        "zapo-js": "^1.8.0",
        "@zapo-js/store-sqlite": "^1.0.0"
    }
}
```

`npm:` aliasing works on npm, pnpm and yarn (berry). If you prefer an explicit
import instead of an alias, change your imports to
`from '@zapo-js/baileys-connector'` and drop the alias entry.

## Usage

Unchanged from Baileys:

```ts
import makeWASocket, {
    Browsers,
    DisconnectReason,
    useMultiFileAuthState
} from '@whiskeysockets/baileys'

const { state, saveCreds } = await useMultiFileAuthState('./auth')

const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Chrome')
})

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) console.log('scan:', qr)
    if (connection === 'close') {
        const status = (lastDisconnect?.error as any)?.output?.statusCode
        if (status !== DisconnectReason.loggedOut) {
            // reconnect
        }
    }
})

sock.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0]
    if (!message?.message?.conversation) return
    await sock.sendMessage(message.key.remoteJid!, { text: 'pong' })
})
```

## Migrating an existing session

**A session paired against upstream Baileys has to be linked again.** Baileys and
zapo-js store signal sessions, pre-keys and sender keys in different on-disk
representations, so an existing `auth/` folder cannot be replayed. The first run
through the connector shows a fresh QR (or accepts a pairing code).

`makeWASocket` refuses a foreign auth state explicitly rather than failing later
with a decryption error.

## Persistence

`useMultiFileAuthState(folder)` keeps the same call shape, but the folder holds a
single `zapo-state.sqlite` written by `@zapo-js/store-sqlite` instead of one JSON
file per key.

Already have a zapo-js store (MySQL, Postgres, Redis, Mongo, custom)? Skip the
helper:

```ts
import { useZapoAuthState } from '@zapo-js/baileys-connector'

const { state, saveCreds } = useZapoAuthState({ store, sessionId: 'default' })
```

`saveCreds` is a no-op kept for source compatibility: zapo-js writes credentials
to the store as they change.

## Escape hatch

Anything the connector does not map is one property away:

```ts
sock.zapo // the underlying zapo-js WaClient
await sock.zapo.newsletter.create({ name: 'my channel' })
sock.zapo.on('history_sync_chunk', (chunk) => console.log(chunk.progress))
```

---

## Compatibility matrix

### Events (`sock.ev`)

| Baileys event               | Status  | Source in zapo-js                                                                                                                                                         |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.update`         | full    | `auth_qr`, `connection`, `auth_paired`, `offline_resume`                                                                                                                  |
| `creds.update`              | full    | emitted on pair and on open (persistence is automatic)                                                                                                                    |
| `messages.upsert`           | full    | `message`                                                                                                                                                                 |
| `messages.update`           | partial | `receipt` (status), `message_protocol` (revoke), `message_addon` (edit)                                                                                                   |
| `messages.reaction`         | full    | `message_addon`                                                                                                                                                           |
| `message-receipt.update`    | full    | `receipt`                                                                                                                                                                 |
| `presence.update`           | full    | `presence`, `chatstate`                                                                                                                                                   |
| `groups.update`             | partial | `group` (subject, description, announce, restrict, ephemeral, approval mode)                                                                                              |
| `group-participants.update` | full    | `group`                                                                                                                                                                   |
| `chats.update`              | partial | `mutation` (archive, pin, mute, mark-read)                                                                                                                                |
| `chats.delete`              | full    | `mutation` (delete-chat)                                                                                                                                                  |
| `contacts.update`           | partial | `mutation` (contact rename)                                                                                                                                               |
| `blocklist.set`             | full    | `blocklist`                                                                                                                                                               |
| `call`                      | full    | `call`                                                                                                                                                                    |
| `messaging-history.set`     | **no**  | zapo-js reports history progress only (`history_sync_chunk`); the messages land in the store. Read them from the store, or listen to `history_sync_chunk` on `sock.zapo`. |
| `chats.upsert`              | **no**  | no equivalent push - chats surface through `mutation`/history                                                                                                             |
| `contacts.upsert`           | **no**  | same as above                                                                                                                                                             |
| `messages.delete`           | **no**  | revokes arrive as `messages.update`                                                                                                                                       |
| `messages.media-update`     | **no**  | use `sock.updateMediaMessage`, which resolves directly                                                                                                                    |
| `blocklist.update`          | **no**  | zapo-js always refetches the full list                                                                                                                                    |
| `groups.upsert`             | **no**  | no equivalent push                                                                                                                                                        |
| `labels.*`, `newsletter.*`  | **no**  | reachable on `sock.zapo.newsletter`                                                                                                                                       |

### Socket methods

| Method                                                                                                                                                                                                                                                                                 | Status                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `sendMessage`, `sendPresenceUpdate`, `presenceSubscribe`, `readMessages`, `sendReceipt`                                                                                                                                                                                                | full                                                                            |
| `updateMediaMessage`                                                                                                                                                                                                                                                                   | full (resolves after the re-upload instead of emitting `messages.media-update`) |
| `onWhatsApp`, `profilePictureUrl`, `updateProfilePicture`, `removeProfilePicture`, `updateProfileStatus`, `updateProfileName`, `fetchStatus`                                                                                                                                           | full                                                                            |
| `fetchBlocklist`, `updateBlockStatus`                                                                                                                                                                                                                                                  | full                                                                            |
| `groupMetadata`, `groupCreate`, `groupLeave`, `groupUpdateSubject`, `groupUpdateDescription`, `groupParticipantsUpdate`, `groupSettingUpdate`, `groupInviteCode`, `groupRevokeInvite`, `groupAcceptInvite`, `groupGetInviteInfo`, `groupToggleEphemeral`, `groupFetchAllParticipating` | full                                                                            |
| `chatModify`                                                                                                                                                                                                                                                                           | partial: `archive`, `pin`, `mute`, `markRead`, `clear`, `delete`, `star`        |
| `logout`, `end`, `waitForConnectionUpdate`, `requestPairingCode`, `generateMessageTag`, `sendNode`, `query`                                                                                                                                                                            | full                                                                            |
| `relayMessage`, `assertSessions`, `createParticipantNodes`, `getUSyncDevices`, `waUploadToServer`, `refreshMediaConn`                                                                                                                                                                  | not mapped - use `sock.zapo`                                                    |
| `newsletter*`, product/catalog (`getCatalog`, `productCreate`, ...), labels                                                                                                                                                                                                            | not mapped - `sock.zapo.newsletter` / `sock.zapo.business`                      |

### `sendMessage` content

| Content                                                                                                             | Status                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `{ text, linkPreview }`                                                                                             | full                                                   |
| `{ image \| video \| audio \| document \| sticker }`, incl. `ptv`, `ptt`, `gifPlayback`, `caption`, `jpegThumbnail` | full                                                   |
| `{ poll }`, `{ react }`, `{ delete }`, `{ pin, type, time }`                                                        | full                                                   |
| `{ forward }`                                                                                                       | full (forward flag set; score not propagated)          |
| `{ location }`, `{ contacts }`, `{ listReply }`, `{ interactiveMessage }`                                           | passed through as a raw proto                          |
| `{ disappearingMessagesInChat }`                                                                                    | full (routed to the group ephemeral IQ, like upstream) |
| `{ buttonReply }`, `{ groupInvite }`, `{ product }`, `sharePhoneNumber`, `requestPhoneNumber`                       | not mapped - build the proto and pass it through       |

Send options: `messageId`, `quoted`, `ephemeralExpiration`, `mediaUploadTimeoutMs`,
plus `mentions`, `contextInfo`, `viewOnce` and `edit` read off the content object.
`timestamp`, `statusJidList`, `backgroundColor`, `font` and `broadcast` are
accepted and ignored.

### Config

Mapped: `auth`, `logger` (a pino-shaped logger is adapted), `browser`, `version`,
`connectTimeoutMs`, `keepAliveIntervalMs`, `defaultQueryTimeoutMs`,
`markOnlineOnConnect`, `syncFullHistory`, `generateHighQualityLinkPreview`,
`shouldIgnoreJid`.

Accepted and ignored (zapo-js handles these itself or has no equivalent):
`printQRInTerminal`, `qrTimeout`, `emitOwnEvents`, `msgRetryCounterCache`,
`mediaCache`, `userDevicesCache`, `callOfferCache`, `placeholderResendCache`,
`getMessage`, `cachedGroupMetadata`, `patchMessageBeforeSending`,
`makeSignalRepository`, `transactionOpts`, `appStateMacVerification`, `agent`,
`fetchAgent`, `options`.

Anything else can go through `zapo`, which is merged last into the
`WaClientOptions`:

```ts
makeWASocket({ auth: state, zapo: { proxy: { ws: agent }, addons: { autoDecrypt: true } } })
```

### Other exports

`proto` / `WAProto`, `DisconnectReason`, `Browsers`, `WAMessageStubType`,
`WAMessageStatus`, `delay`, `getContentType`, `normalizeMessageContent`,
`downloadMediaMessage`, `downloadContentFromMessage`, `fetchLatestBaileysVersion`,
`makeCacheableSignalKeyStore` (identity - zapo-js caches internally), and the jid
helpers (`jidEncode`, `jidDecode`, `jidNormalizedUser`, `areJidsSameUser`,
`isJidUser`, `isJidGroup`, `isJidBroadcast`, `isJidStatusBroadcast`,
`isJidNewsletter`, `isLidUser`).

Not provided: `makeInMemoryStore` (removed upstream too - use a zapo-js store),
`generateWAMessage*` (zapo-js builds the stanza inside `send`), and
`useMultiFileAuthState`'s per-key JSON files.
