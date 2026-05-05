# M02 — X-Plane Web API Client Library

**Status:** Not started
**Estimated effort:** 8–12 h
**Depends on:** M01 (walking skeleton must run; we now extract and harden the X-Plane access)

## Goal

Build a reusable `src/xplane/` module that all subsequent actions consume. Hides Web API quirks (session-scoped IDs, reconnect, subscription multiplexing) behind a clean interface.

## Scope (in)

- HTTP client wrapping the REST endpoints we need:
  - `getDataRefId(name): Promise<number>` — cached
  - `getCommandId(name): Promise<number>` — cached
  - `readDataRef(id): Promise<number | string | number[]>`
  - `writeDataRef(id, value): Promise<void>`
  - `activateCommand(id): Promise<void>`
  - `beginCommand(id) / endCommand(id)` — for hold-style commands
- WebSocket client:
  - `connect()` with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  - `subscribe(datarefId, callback)` / `unsubscribe(handle)`
  - On reconnect: re-subscribe everything automatically
  - On X-Plane restart (numeric IDs invalidated): clear caches + re-resolve names
- Subscription multiplexer (`src/xplane/subscriptions.ts`):
  - If two actions watch the same DataRef, only one subscription goes to X-Plane; both callbacks fire on update.
- Status events (emitter): `connected`, `disconnected`, `error` — actions use these to render error icons.

## Scope (out)

- Anything UI-related (no `setTitle`, no `setImage`, no Stream Deck SDK calls in this module)
- Action-specific logic
- Property Inspector

## Deliverables

- `src/xplane/client.ts` — REST + WS, no business logic
- `src/xplane/subscriptions.ts` — dedup + fan-out
- `src/xplane/types.ts` — TypeScript types for Web API payloads
- `src/xplane/index.ts` — public surface (a single `XPlaneClient` class or similar)
- M01's pause action refactored to use the new client (proves the API)

## Acceptance Criteria

- [ ] M01's pause action still works after refactor — no regression.
- [ ] If X-Plane is killed and restarted while the plugin runs, the next button press still works (cache invalidates and re-resolves).
- [ ] If X-Plane is not running when the plugin starts, the client retries connecting until it succeeds — no crash.
- [ ] Two actions subscribing to the same DataRef result in one WS subscription, not two (verify in X-Plane logs or by counting `dataref_subscribe_values` messages).
- [ ] Status events emit on connect/disconnect; logs reflect them.

## Verification Steps

1. **Unit-style manual test** with a tiny script (`scripts/smoke-client.ts`) that imports the client and:
   - Resolves an ID
   - Reads a DataRef value
   - Writes a value
   - Subscribes and prints updates for 5 seconds
2. **Resilience test:**
   - Start plugin → confirm pause works
   - Quit X-Plane (force-quit) → verify plugin logs show disconnect
   - Restart X-Plane and load aircraft → press pause button → still works
3. **Dedup test:**
   - Temporarily add two console-log subscriptions to the same DataRef
   - Inspect WS traffic via `wscat -c ws://localhost:8086/api/v3` in another terminal — only one subscribe message expected

## Notes

- X-Plane Web API doc: <https://developer.x-plane.com/article/x-plane-web-api/>
- Pin `/api/v3` in one constant — easy to bump later.
- Use `AbortController` for in-flight HTTP requests so we can cancel during disconnect.
- Don't import Stream Deck SDK here. Keep this module pure — testable in isolation.
- Avoid an Event Emitter library — Node has `EventEmitter` built in.
