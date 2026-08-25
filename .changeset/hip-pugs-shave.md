---
'@zapo-js/baileys-connector': minor
---

Add `@zapo-js/baileys-connector`: a drop-in `@whiskeysockets/baileys` API surface
backed by zapo-js. Ships `makeWASocket` with the Baileys event emitter, socket
methods, `sendMessage` content mapping, jid helpers, `DisconnectReason`,
`Browsers`, media download helpers and a zapo-js-backed `useMultiFileAuthState`,
plus a `sock.zapo` escape hatch to the underlying `WaClient`.
