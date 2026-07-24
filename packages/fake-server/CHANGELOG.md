# @zapo-js/fake-server

## 1.1.0

### Minor Changes

- Interop with non-zapo-js clients (Baileys forks, whatsmeow) and programmatic server config. The fake Noise cert chain now carries a valid `notBefore`/`notAfter` window (strict clients rejected the 1970 default as expired). Default IQ handlers answer the `passive` set and `encrypt` get `<count>` queries these clients block on before reporting the connection as open, and an `<ib><offline count="0"/></ib>` bulletin is sent after every login so buffered-event clients flush. `FakePeer` default message ids are now WA-style hex (an `@` broke strict binary decoders). The CLI gains a `--pair <jid>` mode that drives QR pairing over stdin, and `--log` no longer clobbers the server's pipeline events. `FakeWaServerOptions` accepts `successNodeAttributes` and `defaultIqHandlers: false`; IQ responders may return `null` to fall through to the next matching handler; `onPipeline` fans out to multiple listeners and returns an unsubscribe; `WaFakeConnectionPipeline` exposes the parsed `clientPayload`.
- Support multiple isolated clients on one server. Pass a `sessionKey` resolver to `FakeWaServer` to bind each authenticated connection to its own session, keyed by the returned id; sessions never share peers, groups, prekeys, app-state, or captured stanzas. New `server.session(id)` and `server.sessionFor(pipeline)` return the isolated `FakeServerSession` (its own `registries`, `preKeyDispenser`, `appStateSync`, IQ router, and `expectIq`/`expectStanza`/capture). `server.createFakePeer(opts, pipeline)`, `triggerPreKeyUpload(pipeline)`, `pushServerSyncNotification(pipeline)`, and `runPairing(pipeline)` all route to the connecting pipeline's session; `server.registerIqHandler(...)` applies to every session while `session.registerIqHandler(...)` scopes to one. Without a `sessionKey` the server keeps a single default session and the existing `server.registries` / `expectIq` / `preKeyDispenser` surface is unchanged.

## 1.0.0

### Major Changes

- Align with the `zapo-js` 1.0.0 stable release. Now requires `zapo-js@^1.0.0`.

## 0.3.0

### Minor Changes

- Initial public release. A fake WhatsApp Web server used for end-to-end testing of
  zapo-js: noise handshake, IQ/push routing, fake signal sessions, app-state crypto,
  history sync, prekey upload/fetch, group ops, and a CLI bin (`fake-wa-server`).
- Performance: O(1) device lookup and server profiling in bench harness.
