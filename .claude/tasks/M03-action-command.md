# M03 — Action: `command` (configurable)

**Status:** Not started
**Estimated effort:** 4–6 h
**Depends on:** M02 (uses the X-Plane client)

## Goal

Replace M01's hard-coded `command-pause` action with a fully configurable `command` action: the user enters any X-Plane CommandRef path in the Property Inspector, and `keyDown` triggers it.

## Scope (in)

- Action ID `command` (delete or rename M01's `command-pause`).
- Property Inspector (`com.robertw.xplane.sdPlugin/ui/command.html`):
  - One text input: `commandPath` (e.g. `sim/autopilot/heading_up`)
  - Optional toggle: `holdMode` — when on, route via the client's `beginCommand`/`endCommand` (these go over WebSocket `command_set_is_active`, since the REST API has no begin/end endpoints — see M02)
- On `keyDown`:
  - If `holdMode`: `beginCommand(id)`
  - Otherwise: `activateCommand(id)`
- On `keyUp` (only relevant when `holdMode`): `endCommand(id)`
- Visual feedback: `showOk()` on success, `showAlert()` on failure.
- Settings persist per Stream Deck button via the SDK's settings storage.

## Scope (out)

- Multi-step command sequences (Phase 2)
- Autocomplete in the Property Inspector (M07)
- DataRef reading

## Deliverables

- `src/actions/command.ts` — registers via `@action({ UUID: 'com.robertw.xplane.command' })`
- `com.robertw.xplane.sdPlugin/ui/command.html` — Property Inspector
- Updated `manifest.json` action entry

## Acceptance Criteria

- [ ] User can drag the action onto a button, type any command path, and pressing fires it.
- [ ] Empty/invalid `commandPath` → button shows alert icon on press, log explains the reason.
- [ ] `holdMode` works: pressing and holding triggers continuous behavior (e.g. heading bug spinning), releasing stops.
- [ ] Settings survive Stream Deck app restart.
- [ ] X-Plane restart while plugin runs → command still works on next press.

## Verification Steps

1. Configure a button with `commandPath = sim/operation/pause_toggle` → press → X-Plane pauses.
2. Configure a button with `commandPath = sim/autopilot/heading_up` and `holdMode = true` → press and hold → AP heading bug rotates → release → stops.
3. Configure a button with `commandPath = sim/this/does/not/exist` → press → alert icon, log shows resolve failure.
4. Restart Stream Deck app → settings persist.

## Notes

- Reuse `XPlaneClient` from M02. **Do not duplicate fetch logic in this file.**
- The Stream Deck SDK auto-saves the Property Inspector form back into the action's `settings` object — read it via `ev.payload.settings` in `onWillAppear`.
- Trim leading/trailing whitespace from the user input.
