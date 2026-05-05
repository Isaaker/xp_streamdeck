# M04 — Action: `dataref-display` (read-only live value)

**Status:** Not started
**Estimated effort:** 8–12 h
**Depends on:** M02 (subscriptions), M03 (settings/PI patterns)

## Goal

Show a live X-Plane DataRef value as **text on a Stream Deck button**. Pure read-only — no click action.

Example: a button that always shows the current AP heading bug as `120°`.

## Scope (in)

- Action ID `dataref-display`
- Property Inspector fields:
  - `datarefPath` (text)
  - `format` (text, printf-style; default `%s`)
  - `unitScale` (number, optional; multiplied before formatting — e.g. radians→degrees, sec→min)
  - `precision` (number, optional; decimals)
- Behavior:
  - On `onWillAppear`: subscribe via M02 client
  - On WS update: format value, call `setTitle(formatted)`
  - On `onWillDisappear`: unsubscribe (let the multiplexer GC if last subscriber)
  - On X-Plane disconnect: show `setTitle("X-Plane")` plus alert state, restore on reconnect
- Format helper in `src/util/format.ts` — printf-style for numbers and strings.

## Scope (out)

- Click action (this is read-only)
- Multi-state images (M06 covers state-based icons)
- Boolean image swap (Phase 2 enhancement)

## Deliverables

- `src/actions/dataref-display.ts`
- `com.robertw.xplane.sdPlugin/ui/dataref-display.html`
- `src/util/format.ts` with unit tests (or a smoke-test script)
- Manifest entry

## Acceptance Criteria

- [ ] Button shows the current value of any configured DataRef and updates live (within ~100 ms of value change).
- [ ] When X-Plane is unavailable, button shows a clear "no connection" indicator instead of stale data.
- [ ] When the user reconfigures the DataRef path, the old subscription is dropped and the new one starts.
- [ ] Removing the button from the Stream Deck cleans up the subscription.
- [ ] Multiple buttons watching the same DataRef cause only one X-Plane subscription (verify M02 multiplexer working).

## Verification Steps

1. **Heading display:**
   - `datarefPath = sim/cockpit/autopilot/heading_mag`
   - `format = %.0f°`
   - In X-Plane: rotate AP heading bug → button updates within ~100 ms.
2. **Altitude display:**
   - `datarefPath = sim/cockpit2/autopilot/altitude_dial_ft`
   - `format = %.0f ft`
   - Adjust AP altitude → updates.
3. **Unit conversion:**
   - `datarefPath = sim/flightmodel/position/groundspeed` (m/s)
   - `unitScale = 1.94384` (m/s → kt)
   - `format = %.0f kt`
   - Verify against X-Plane HSI groundspeed.
4. **Connection-loss UX:** quit X-Plane → button title changes to `X-Plane` (or similar) and shows alert.
5. **Subscription dedup:** drop two buttons with the same DataRef → only one WS subscribe in X-Plane logs.

## Notes

- Stream Deck button title space is limited (~3 short lines). Truncate sensibly.
- `setTitle` is rate-limited internally by the SDK — fine for ~10 Hz, don't worry.
- Use `ev.payload.settings` for current settings; on settings change (`onDidReceiveSettings`), tear down old subscription and rebuild.
