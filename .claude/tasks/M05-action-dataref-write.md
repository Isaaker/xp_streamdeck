# M05 — Action: `dataref-write` (write fixed value)

**Status:** Not started
**Estimated effort:** 3–5 h
**Depends on:** M02 (client), M03 (PI pattern), M04 (optional display reuse)

## Goal

A button that writes a fixed value to a DataRef on press. Use case: "Parking Brake set to 1", "Set flaps notch 2".

## Scope (in)

- Action ID `dataref-write`
- Property Inspector fields:
  - `datarefPath`
  - `value` (number; sent on `keyDown`)
  - Optional: reuse M04's display logic to also show the current value (toggle `showCurrentValue`)
- On `keyDown`: write the configured value via M02 client.
- Visual feedback: `showOk` / `showAlert`.

## Scope (out)

- Toggle behavior (M06 owns toggling)
- State-based images (M06)

## Deliverables

- `src/actions/dataref-write.ts`
- `com.robertw.xplane.sdPlugin/ui/dataref-write.html`
- Manifest entry

## Acceptance Criteria

- [ ] User can configure any writable DataRef path and a numeric value; press writes it.
- [ ] Press feedback (`showOk` / `showAlert`) reflects success/failure.
- [ ] Optional display mode shows current value live (when enabled).

## Verification Steps

1. `datarefPath = sim/cockpit2/controls/parking_brake_ratio`, `value = 1` → press → parking brake sets in X-Plane.
2. Same DataRef, `value = 0` → press → releases.
3. Read-only DataRef (e.g. `sim/flightmodel/position/groundspeed`) → press → alert + log explains write rejection.

## Notes

- Some DataRefs are read-only. The Web API will return an error — surface it cleanly.
- Don't try to be smart about ranges/types here. Trust the user's input; X-Plane's API tells us if it's wrong.
