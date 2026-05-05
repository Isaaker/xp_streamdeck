# M01 — Walking Skeleton: One Button → X-Plane Pause ⭐

**Status:** Not started
**Estimated effort:** 4–8 h
**Depends on:** Nothing. This is the foundation.

## Goal

Get **one single button** working end-to-end before building anything else. When the user presses the configured button on the Stream Deck (or in the Stream Deck app preview), X-Plane pauses. That's it.

This milestone proves the entire toolchain: Node + TypeScript + `@elgato/streamdeck` + plugin loading + Stream Deck app + X-Plane Web API. Everything afterwards builds on a verified foundation.

## Scope (in)

- Initialize the project via `streamdeck create` (Node/TS scaffold).
- Create exactly **one action**: `command-pause` with hard-coded behavior — triggers `sim/operation/pause_toggle` on `keyDown`.
- One static icon (Elgato default is fine).
- Basic README sentence on how to load the plugin (`streamdeck link`).
- First Git commit.

## Scope (out, do not do here)

- Property Inspector
- Configurable command paths (hard-code `sim/operation/pause_toggle`)
- DataRef reading
- Multi-state images
- Reconnect logic
- Error handling beyond `try/catch` + log
- Any other action types

## Deliverables

- `package.json` with `@elgato/streamdeck` dep
- `tsconfig.json`, `rollup.config.mjs` (from scaffold)
- `com.robertw.xplane.sdPlugin/manifest.json` declaring the `command-pause` action
- `src/plugin.ts` registering the action
- `src/actions/command-pause.ts` — on `keyDown` → `POST http://localhost:8086/api/v3/command/<id>/activate`
  - Resolve the command ID once on first use via `GET /api/v3/commands?filter[name]=sim/operation/pause_toggle`
  - Cache in memory; re-resolve on failure (X-Plane restart invalidates IDs)
- Log via `streamDeck.logger` to confirm key press and HTTP outcome

## Acceptance Criteria

- [ ] `npm run build` produces `com.robertw.xplane.sdPlugin/bin/plugin.js`
- [ ] `streamdeck link com.robertw.xplane.sdPlugin` loads the plugin in the Stream Deck app
- [ ] The action shows up in the Stream Deck app's action list
- [ ] With X-Plane running and an aircraft loaded: dropping the action onto a button → pressing it → X-Plane toggles pause
- [ ] Stream Deck logs show one info-level line per press confirming the HTTP call result
- [ ] First Git commit is in place (e.g. "M01: walking skeleton — pause action")

## Verification Steps

1. **Pre-flight smoke test (no plugin yet):**
   ```bash
   curl 'http://localhost:8086/api/v3/commands?filter[name]=sim/operation/pause_toggle'
   # Note the numeric id field from the response
   curl -X POST 'http://localhost:8086/api/v3/command/<id>/activate'
   # X-Plane should toggle pause
   ```
   If this fails, the Web API isn't reachable — fix that before touching the plugin.

2. **Plugin install:**
   ```bash
   cd /Users/robertw/Workspace/x-plane/xp_streamdeck
   npm install
   npm run build
   streamdeck link com.robertw.xplane.sdPlugin
   streamdeck restart com.robertw.xplane
   ```

3. **End-to-end test:**
   - Open Stream Deck app → drag the new action onto a button.
   - Press the (virtual or hardware) button.
   - X-Plane pauses. Press again — unpauses.

4. **Log inspection:**
   ```bash
   tail -f ~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log
   ```
   See per-press log lines.

## Notes

- **Hard-code the command path** in this milestone. Configurability comes in M03.
- **Don't write a generic Web API client yet.** Inline the fetch call in the action — extracting it is M02's job. Premature abstraction here will slow you down.
- The Stream Deck CLI (`streamdeck`) comes from `npm i -g @elgato/cli`.
- The plugin UUID `com.robertw.xplane` should be set during `streamdeck create` and stay consistent.
- Do **not** use `streamdeck pack` yet — that's M08.
