# M08 — Distribution to the Flight-Sim Mac

**Status:** Not started
**Estimated effort:** 1–2 h
**Depends on:** M01–M06 minimum (M07 strongly recommended)

## Goal

Get the working plugin onto the user's flight-sim Mac (where the Stream Deck XL hardware lives) and verify it works on real hardware with a useful starter profile.

## Scope (in)

- `streamdeck pack` produces a `.streamDeckPlugin` bundle.
- Copy the bundle to the flight-sim Mac (AirDrop, USB, network share — user picks).
- Double-click install on flight-sim Mac.
- Configure a small **starter profile** with one of each action type.
- Real-hardware test on the Stream Deck XL.

## Scope (out)

- Code signing / Apple notarization (private use, not required).
- Public marketplace listing.
- Auto-update mechanism.

## Deliverables

- `dist/com.robertw.xplane.streamDeckPlugin` (built artifact).
- `docs/install.md` — short, two-step install instructions for the Sim-Mac.
- `docs/starter-profile.md` — example profile description (e.g. one button per action type).

## Acceptance Criteria

- [ ] `.streamDeckPlugin` builds cleanly without errors.
- [ ] Double-click install on flight-sim Mac launches the Stream Deck app's plugin installer dialog.
- [ ] After install, all four action types appear in the Stream Deck XL action list.
- [ ] Starter profile with at least: 1 command button (Pause), 1 dataref-display (heading), 1 dataref-toggle (gear) — all working on real hardware.
- [ ] No Gatekeeper / quarantine warning blocking install (private use, sideloaded).

## Verification Steps

1. **Build:**
   ```bash
   cd /Users/robertw/Workspace/x-plane/xp_streamdeck
   npm run build
   streamdeck pack com.robertw.xplane.sdPlugin
   ```
2. **Transfer:** AirDrop or copy `com.robertw.xplane.streamDeckPlugin` to the flight-sim Mac.
3. **Install:** double-click the file → Stream Deck app prompts to install → confirm.
4. **Sanity check:** open Stream Deck app → action list contains the four xp-streamdeck actions.
5. **Real hardware:**
   - Start X-Plane on the same Mac.
   - On the Stream Deck XL, drop the four actions onto buttons.
   - Press each → expected behavior happens in X-Plane.
   - For dataref-toggle: verify the image actually flips on the LCD button.

## Notes

- Gatekeeper may grumble on first install — right-click → Open is the standard sideload escape hatch.
- If the user later wants to share the plugin: Apple Developer account + notarization adds 5–10 h. Not in scope here.
- The `.streamDeckPlugin` extension is just a renamed zip of the `.sdPlugin` directory — handy for debugging if install fails.
- Once installed, plugin runs as a background process; check Activity Monitor if it doesn't appear in the Stream Deck app.
