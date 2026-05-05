# M06 — Action: `dataref-toggle` ⭐ (Hauptszenario: Gear UP/DOWN)

**Status:** Implemented — pending hardware verification on sim Mac
**Estimated effort:** 8–12 h
**Depends on:** M02 (client + subscriptions), M03–M05 (action patterns)

## Goal

The flagship action — combines reading + state-based image rendering + click-to-toggle in a single button. This is the user's primary use case (Gear, Lights, Pumps, AP modes, etc.).

**Concrete example:**
- DataRef `sim/cockpit2/controls/gear_handle_down` returns 0 (up) or 1 (down)
- Image OFF: gear-up.png (when value == 0)
- Image ON: gear-down.png (when value == 1)
- Click triggers `sim/flight_controls/landing_gear_toggle` (command mode), button updates automatically when X-Plane reports the new value

## Scope (in)

- Action ID `dataref-toggle`, declares **two states** in `manifest.json`:
  ```json
  "States": [
    { "Image": "imgs/states/off", "Title": "" },
    { "Image": "imgs/states/on",  "Title": "" }
  ]
  ```
- Property Inspector fields:
  - `datarefPath`
  - `valueOff` (default 0), `valueOn` (default 1)
  - `triggerMode`: `write` | `command`
  - `commandPath` (only when triggerMode = command)
  - Two image upload slots: `imageOff`, `imageOn` (base64-encoded into settings)
- Runtime:
  - Subscribe to DataRef → on update, map value to state index → call `setState(index)`
  - If user uploaded custom images, override the manifest defaults via `setImage(state, base64)`
  - On `keyDown`:
    - `triggerMode == 'write'`: read current value; if equals `valueOff` write `valueOn`, else write `valueOff`
    - `triggerMode == 'command'`: activate `commandPath`
- Tolerance for noisy float values: when `valueOff = 0` and `valueOn = 1`, treat anything below 0.5 as off, ≥0.5 as on. Otherwise nearest-match.

## Scope (out)

- More than 2 states (Phase 2: `dataref-multi-state` for AP-Mode OFF/ARM/CAPT)
- Encoder support (Stream Deck Plus only — user has XL)
- Auto-suggested image library (could be M07)

## Deliverables

- `src/actions/dataref-toggle.ts`
- `com.robertw.xplane.sdPlugin/ui/dataref-toggle.html` (with two file-input image slots)
- Default state images in `com.robertw.xplane.sdPlugin/imgs/states/` — neutral OFF/ON placeholders
- Manifest entry with two `States`

## Acceptance Criteria

- [ ] Gear scenario works end-to-end (see Verification step 1).
- [ ] Pressing while X-Plane shows gear DOWN → gear retracts → image flips to UP automatically.
- [ ] If X-Plane changes the DataRef from another input (joystick, keyboard, AI) → image updates without any button press.
- [ ] Custom uploaded images persist across Stream Deck restart.
- [ ] Both `triggerMode = write` and `triggerMode = command` work.
- [ ] Default placeholder images visible if user doesn't upload custom ones.

## Verification Steps

1. **Gear scenario (command mode):**
   ```
   datarefPath  = sim/cockpit2/controls/gear_handle_down
   valueOff     = 0
   valueOn      = 1
   triggerMode  = command
   commandPath  = sim/flight_controls/landing_gear_toggle
   imageOff     = (upload gear-up.png)
   imageOn      = (upload gear-down.png)
   ```
   - In X-Plane (with retractable aircraft), press button → gear retracts → image changes to UP within ~200 ms of animation completing.
   - In X-Plane, drop gear via keyboard `G` → button image updates without pressing the button.

2. **Light scenario (write mode):**
   ```
   datarefPath  = sim/cockpit2/switches/landing_lights_on
   valueOff     = 0
   valueOn      = 1
   triggerMode  = write
   ```
   - Press → lights toggle on; press again → off. Image follows.

3. **External update test:** while plugin runs, change the DataRef from X-Plane's internal panel/joystick → button image flips without any Stream Deck interaction.

4. **Persistence:** restart Stream Deck app → custom uploaded images still appear.

5. **Reconnect:** quit and restart X-Plane → after reconnect, image reflects current state again.

## Notes

- Stream Deck SDK `setState(index)` switches between manifest-declared `States`. `setImage(state, b64)` overrides per-state image at runtime — use this for user-uploaded images.
- For boolean DataRefs, X-Plane sometimes returns `0.0` or `1.0` floats. Use `Math.round(value)` before comparing in the simple boolean case.
- Image upload via `<input type="file">` in the Property Inspector → read as data URL → store base64 in settings (Stream Deck SDK accepts data URLs in `setImage`).
- Re-emit current state on reconnect (after re-subscribing) to refresh visuals.
- **Follow `CLAUDE.md` → "Action Implementation Conventions"**, especially: any boolean toggle in the PI (e.g. an "invert state" flag) must use unchecked = baseline semantics (`=== true` checks in code). `default="true"` on `<sdpi-checkbox>` is broken — verified during M03.
- `triggerMode` is a select, not a checkbox — use `<sdpi-select>` with two options, no default-value pitfall there.
