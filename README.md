# xp_streamdeck

Native Stream Deck plugin for X-Plane 12 on macOS, talking to the X-Plane Web API on `localhost:8086`.

## Prerequisites

- **X-Plane 12.1.1 or newer** — the built-in Web API was introduced in 12.1.1 and is enabled by default.
- Node.js 20.19.5 (pinned via `.nvmrc` — run `nvm use` in this directory).
- The Elgato Stream Deck CLI ships as a devDependency, so no global install is needed; invoke it via `npx streamdeck …` (or install globally with `npm i -g @elgato/cli` if you prefer the bare `streamdeck` command).

## X-Plane Web API setup

X-Plane 12.1.1+ runs the Web API automatically on `http://localhost:8086/api/v3` — **no menu toggle is needed to turn it on**. The toggles in *Settings → Network* labelled *"iPhone, iPad and External Apps"* are unrelated to the Web API; they control the legacy UDP interfaces.

The only relevant setting is opt-out:

- *Settings → Network → **Disable Incoming Traffic*** — must remain **unchecked**, otherwise every Web API call returns `403 Forbidden`.

If you launched X-Plane from the command line with `--no_web_server`, the API is off; restart without that flag. To use a non-default port, use `--web_server_port=<N>` — but note this plugin currently hard-codes `8086` (will be configurable in M03+).

### Quick API smoke test

Before debugging the plugin, verify the API responds:

```bash
curl -i 'http://localhost:8086/api/v3/datarefs/count'
```

| Response | Meaning |
| --- | --- |
| `HTTP/1.1 200 OK` + JSON | API healthy → if the plugin still fails, look at plugin logs |
| `HTTP/1.1 403 Forbidden` | *Disable Incoming Traffic* is checked — uncheck and restart X-Plane |
| `Connection refused` | Web API not running — check X-Plane version and that it wasn't started with `--no_web_server` |

X-Plane's own log usually shows a line like `Web server listening on port 8086` at startup; check `Log.txt` if in doubt:

```bash
grep -i "web" "$HOME/X-Plane 12/Log.txt"
# Mac App Store install instead:
# grep -i "web" "$HOME/Library/Containers/com.laminarresearch.X-Plane/Data/Log.txt"
```

### Plugin-side logs

Once the API is up, plugin activity goes to:

```bash
tail -f ~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log
```

Each press should produce `Resolved sim/operation/pause_toggle -> id=…` and `Activated …`. If nothing appears on press, the plugin isn't loaded — re-run `npx streamdeck restart com.robertw.xplane`.

## Build & install (development)

```bash
make setup                                    # npm install
make build                                    # rollup → bin/plugin.js
npx streamdeck link com.robertw.xplane.sdPlugin
npx streamdeck restart com.robertw.xplane
```

After this, the **X-Plane → Pause** action appears in the Stream Deck app's action list. Drop it onto a key, press it, and X-Plane toggles pause (`sim/operation/pause_toggle`).

## Actions

### DataRef Display

Shows a live X-Plane DataRef value as the button title. Pure read-only — no click action.

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef, e.g. `sim/cockpit/autopilot/heading_mag`.
- **Format** — printf-style template (`%s`, `%d`, `%f`, `%.Nf`, `%%`). Default `%s`.
- **Unit Scale** — optional multiplier applied before formatting (e.g. radians→degrees, m/s→kt, Pa→inHg).
- **Precision** — optional decimals; only used when the format token has no explicit precision.

#### Example: QNH in inHg

X-Plane exposes `sim/weather/aircraft/qnh_pas` as a float in **Pascal**. To show it as `29.92 inHg` on a button:

| Field | Value |
| --- | --- |
| DataRef Path | `sim/weather/aircraft/qnh_pas` |
| Format | `%.2f inHg` |
| Unit Scale | `0.0002953` |
| Precision | *(leave empty)* |

Background: 1 inHg = 3386.389 Pa, so the conversion factor is `1 / 3386.389 ≈ 0.0002953`. Standard QNH 101325 Pa × 0.0002953 = **29.9213** → with `%.2f` → `29.92 inHg`.

For **hPa/mb** (1013) instead:

| Field | Value |
| --- | --- |
| Format | `%.0f hPa` |
| Unit Scale | `0.01` |

## Common Make targets

Run `make help` for the full list. Most-used: `make build`, `make clean`, `make distclean`, `make setup`, `make package`.
