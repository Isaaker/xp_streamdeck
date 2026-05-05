# xp_streamdeck

Native Stream Deck plugin for X-Plane 12 on macOS, talking to the X-Plane Web API on `localhost:8086`.

## Prerequisites

- Node.js 20.19.5 (pinned via `.nvmrc` — run `nvm use` in this directory).
- The Elgato Stream Deck CLI ships as a devDependency, so no global install is needed; invoke it via `npx streamdeck …` (or install globally with `npm i -g @elgato/cli` if you prefer the bare `streamdeck` command).

## Build & install (development)

```bash
make setup                                    # npm install
make build                                    # rollup → bin/plugin.js
npx streamdeck link com.robertw.xplane.sdPlugin
npx streamdeck restart com.robertw.xplane
```

After this, the **X-Plane → Pause** action appears in the Stream Deck app's action list. Drop it onto a key, press it, and X-Plane toggles pause (`sim/operation/pause_toggle`).

## Common Make targets

Run `make help` for the full list. Most-used: `make build`, `make clean`, `make distclean`, `make setup`, `make package`.
