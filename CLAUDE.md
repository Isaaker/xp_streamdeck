# xp_streamdeck — Stream Deck Plugin for X-Plane 12 on macOS

## Goal

A native macOS Stream Deck plugin (Elgato Stream Deck XL) that controls X-Plane 12 via its native Web API — generic enough to drive any DataRef or CommandRef from a button, including state-based images (e.g. Gear UP/DOWN). Replaces the keyboard-shortcut workaround on Mac, where the Windows-only PilotsDeck has no equivalent.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 24+ (required by `@elgato/streamdeck`)
- **SDK:** `@elgato/streamdeck` (official npm package, bundled by Elgato CLI scaffold)
- **Bundler:** Rollup (preconfigured by `streamdeck create`)
- **HTTP client:** native `fetch` (Node 24)
- **WebSocket client:** `ws`
- **Property Inspector:** HTML + vanilla JS, optionally `@elgato/sdpi-components`
- **Target:** macOS only (private/sideloaded — no notarization)

## Talking to X-Plane

X-Plane 12.1.1+ exposes a native Web API on `localhost:8086` — both REST and WebSocket. **No custom XPLM C++ plugin required.**

- REST base: `http://localhost:8086/api/v3`
- WebSocket: `ws://localhost:8086/api/v3`
- Capabilities used: read/write DataRefs, activate Commands, subscribe to DataRef changes (~10 Hz)
- Docs: <https://developer.x-plane.com/article/x-plane-web-api/>

### Important runtime details

- DataRef and Command **numeric IDs are session-scoped** — re-resolve on every X-Plane restart.
- Web API is localhost-only by design (fine for our case — Stream Deck and X-Plane on same Mac).
- The Web API was introduced in X-Plane 12.1.1 (Jan 2025). Pin `/api/v3` as a constant to make future version bumps easy.

## Project Structure

```
xp_streamdeck/
├── com.robertw.xplane.sdPlugin/   # Plugin bundle (output)
│   ├── manifest.json
│   ├── bin/plugin.js              # Rollup output
│   ├── ui/                        # Property Inspectors (HTML)
│   └── imgs/                      # Action icons + state images
├── src/
│   ├── plugin.ts                  # Entry; registers actions
│   ├── actions/                   # One file per action type
│   ├── xplane/                    # Web API client + subscriptions
│   └── util/                      # Helpers (formatting, etc.)
└── .claude/tasks/                 # Milestone task files (one .md per milestone)
```

## Working Style

- **Walking skeleton first, then layer up.** Always get a thin end-to-end slice working before adding breadth. M01 (one button → X-Plane Pause) is the foundation everything else depends on.
- **One milestone per session.** Each `.md` in `.claude/tasks/` is self-contained: scope, deliverables, acceptance criteria, verification steps. Don't pull from earlier session context — re-read the relevant milestone file.
- **English** in all code, comments, manifest strings, and milestone files. Communication with the user remains German.
- **Default to no comments.** Only add a comment when the *why* is non-obvious.
- **No premature abstractions.** Three similar lines beat a flexible factory.
- **Verification before claiming done.** Each milestone has explicit verification steps — run them before marking complete.

## Test Environment Reality

- The **dev laptop has no Stream Deck connected.** Stream Deck app + plugin sideloading reach ~90% of testing surface; final hardware verification happens on the flight-sim Mac.
- X-Plane runs on the same Mac as Stream Deck — both default to localhost.
- Smoke-test the X-Plane Web API with `curl` first whenever debugging suspect plugin behavior:
  ```
  curl 'http://localhost:8086/api/v3/datarefs?filter[name]=sim/cockpit2/controls/gear_handle_down'
  ```

## Reference Implementations (study, don't copy)

- **PilotsDeck** (Windows-only, .NET) — overall feature scope target: <https://github.com/Fragtality/PilotsDeck>
- **Cockpitdecks** (Python, macOS-friendly, Web API based) — architectural reference: <https://github.com/devleaks/cockpitdecks>
- **Elgato plugin samples** — TypeScript SDK patterns: <https://github.com/elgatosf/streamdeck-plugin-samples>

## Where Things Live

- Approved feasibility plan: `/Users/robertw/.claude/plans/wie-schwierig-w-re-es-merry-pumpkin.md`
- Milestone task files: `.claude/tasks/M01..M08-*.md`
- Stream Deck plugin logs (after install): `~/Library/Logs/ElgatoStreamDeck/`
