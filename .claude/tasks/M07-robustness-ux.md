# M07 — Robustness & Property Inspector UX

**Status:** Implemented — pending hardware verification
**Estimated effort:** 6–10 h core + 4–8 h optional polish
**Depends on:** M01–M06 (the four action types must exist)

## Goal

Take the working set of actions from "demo quality" to "actually pleasant to live with". Two themes:
1. **Robustness** when X-Plane is restarting, missing, or returning unexpected data.
2. **Property Inspector quality of life** so configuring buttons is fast, not error-prone.

## Scope (in)

### Robustness
- Unified "X-Plane unreachable" tile state for every action: greyed icon + small "X-Plane" overlay on title.
- Auto-reconnect already from M02, but verify all four actions handle reconnect cleanly: M03 keeps id cache fresh, M04/M06 re-subscribe, M05 keeps last input value.
- Invalid DataRef/Command path → persistent alert state (not just a flash on press) + tooltip "DataRef not found".
- Logging discipline: each action logs at startup (settings loaded), on failure (with cause), on settings change.

### Property Inspector polish
- **Autocomplete** for DataRef paths in M04, M05, M06 PIs:
  - Debounced (300 ms) call to `GET /api/v3/datarefs?filter[name]=<prefix>`
  - Dropdown with up to 20 matches; arrow-key navigation
- **Autocomplete** for Command paths in M03, M06 PIs (same UX, different endpoint).
- **Live preview** in PIs: while editing `datarefPath`, show the current live value beneath the field — so the user immediately sees they typed the right path.

## Scope (out)

- Validation of types (read-only vs writable). The error on press is fine.
- Saved profiles / import-export (Phase 2).
- Pre-bundled icon library (Phase 2).

## Deliverables

- `src/util/error-tile.ts` — shared helper to render a consistent unreachable / invalid state.
- Updated PIs (`*.html`) for M03/M04/M05/M06 with autocomplete + live preview components.
- Optionally: `src/ui/sdpi-autocomplete.js` reusable web component.

## Acceptance Criteria

- [ ] Quitting X-Plane: every active button shows the same "X-Plane unreachable" indicator within 5 s.
- [ ] Restarting X-Plane: all buttons recover automatically without any user action.
- [ ] Typo in DataRef path → button shows persistent alert; PI shows "Not found" inline.
- [ ] Autocomplete works for DataRef and Command paths in all relevant PIs.
- [ ] Live preview shows current value while editing — confirmed against X-Plane state.

## Verification Steps

1. Configure four buttons (one per action type), all working.
2. Force-quit X-Plane → within ~5 s, all four buttons show the unreachable indicator. No console errors.
3. Restart X-Plane and load aircraft → all four resume normal display/behavior automatically.
4. Edit a DataRef-display button: type `sim/cockpit/auto` → autocomplete shows matches → pick one → live preview shows current value.
5. Edit a command button: type `sim/flight_controls/landing` → autocomplete suggests gear-related commands.
6. Set a DataRef path with a typo → save → button shows persistent alert + PI shows "Not found".

## Notes

- Keep the error-tile helper minimal — duplication of two lines beats a leaky abstraction.
- The Web API supports name-prefix filters; check exact query syntax in current docs.
- Consider keyboard shortcut "↓" to focus the autocomplete dropdown for accessibility.
