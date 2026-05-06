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

### Command

Triggers any X-Plane CommandRef on key press. Optional **Hold Mode** routes the press through the WebSocket `command_set_is_active` begin/end pair instead of a one-shot activate — useful for things that should keep firing while the key is held (e.g. spinning the heading bug).

Property Inspector fields:

- **Command Path** — the X-Plane CommandRef, e.g. `sim/operation/pause_toggle`.
- **Hold Mode** — when checked, sends begin on `keyDown` and end on `keyUp`.
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success. Errors still always show the alert icon.

#### Example: toggle pause

| Field | Value |
| --- | --- |
| Command Path | `sim/operation/pause_toggle` |
| Hold Mode | *(unchecked)* |

Press → X-Plane pauses; press again → resumes.

#### Example: spin the heading bug while held

| Field | Value |
| --- | --- |
| Command Path | `sim/autopilot/heading_up` |
| Hold Mode | *(checked)* |

Press and hold → heading bug rotates continuously; release → stops. Pair with `sim/autopilot/heading_down` on a second key for the opposite direction.

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

## Button icons

Button images shown on the Stream Deck are generated locally by a small TypeScript pipeline so the whole set stays visually consistent (same font size, same baseline, same LED-bar geometry across every icon).

```bash
make icons
```

Three kinds of icons are produced from a single catalog (`scripts/icons/catalog.ts`):

- **`toggle`** — for action buttons that flip a state (AP HDG mode, FD on/off, …). Generates an `_on` + `_off` pair: bold uppercase label centered, colored LED bar at the bottom (lit in the accent color when ON, dark grey when OFF, with a soft glow).
- **`display`** — for the **`dataref-display`** action (live X-Plane readouts: current altitude, wind, AP setpoints, …). Generates a single PNG: small caption + thin accent line in the top third, rest of the key left empty so Stream Deck's title overlay can render the live value cleanly underneath.
- **`nudge`** — for single-press command buttons that increment/decrement an AP setpoint (heading bug, altitude target, V/S, source). Generates a single PNG: bold label at the top, big filled triangle in the accent color pointing in the action direction. Pair with the `command` action (with `Hold Mode` for continuous spin).

Output: `out/icons/<name>_on.png` + `<name>_off.png` for toggles, `out/icons/<name>.png` for displays. All 144×144. The `out/` folder is gitignored and wiped by `make clean`.

### Adding a new icon

1. Open `scripts/icons/catalog.ts`.
2. Append a single entry to the `catalog` array, picking the `kind`:

   ```ts
   // toggle button
   { kind: 'toggle',  name: 'apu',     label: 'APU', accent: '#ef4444', group: 'ENG' },

   // live readout (header for the dataref-display action)
   { kind: 'display', name: 'cur_oat', label: 'OAT', accent: '#94a3b8', group: 'INST' },

   // nudge button (single press → CommandRef; arrow indicates direction)
   { kind: 'nudge',   name: 'crs_left', label: 'CRS', direction: 'left',  accent: '#3b82f6', group: 'AP-NUDGE' },
   { kind: 'nudge',   name: 'crs_x2',   label: 'CRS', direction: 'right', double: true, accent: '#3b82f6', group: 'AP-NUDGE' },
   ```

   - `kind` — `'toggle'` for on/off buttons, `'display'` for live-readout headers, `'nudge'` for single-press arrow buttons.
   - `name` — file-name stem; must be unique. Output: `apu_on.png` + `apu_off.png` (toggle) or `cur_oat.png` / `crs_left.png` (display, nudge).
   - `label` — text shown on the icon. **Toggle:** ≤ 4 chars renders at 44px; longer labels auto-shrink in fixed steps (5→36, 6→30, 7→26, 8→22, 9→20, 10+→18). **Display:** ≤ 6 characters comfortably (`AP HDG`, `W SPD`). **Nudge:** ≤ 4 characters (`HDG`, `SRC`, `ALT`, `VS`); the arrow is the visual focus.
   - `accent` — hex color. For toggles: the LED-bar ON color. For displays: the accent line under the caption. For nudges: the arrow fill color. Use the established palette where it fits a group, or pick a new color for a new group.
   - `group` — free-text grouping tag (`AP`, `INST`, `AP-SET`, `AP-NUDGE`, `ENG`, `LIGHTS`, `CTRL`, …). Human-only; the renderer ignores it.
   - `direction` *(nudge only)* — `'up'` / `'down'` / `'left'` / `'right'`. Arrow points this way.
   - `double` *(nudge only, optional)* — `true` renders two stacked triangles for "coarse step" semantics (e.g. ALT ↑↑ for big increments).
3. Run `make icons`. The new files appear in `out/icons/`.
4. In the Stream Deck app: drag the PNG onto a key. For a `display` icon, configure the `dataref-display` action (DataRef path + format) on that key — the live value renders as the title in the empty zone of the icon.

To rename an icon, edit the catalog entry and re-run; the old PNGs stay until you run `make clean`.

### Where to change the look

All visual decisions live in `scripts/icons/template.ts` (a single SVG renderer):

- `LABEL_FONT_SIZE`, `LABEL_BASELINE_Y` — text size and vertical position.
- `BAR_HEIGHT`, `BAR_INSET_X`, `BAR_INSET_BOTTOM`, `BAR_RADIUS` — LED bar geometry.
- `BG`, `BAR_OFF`, `LABEL_COLOR` — base palette.
- The `<filter id="glow">` block — strength of the lit-bar glow.

Change once → re-run `make icons` → every icon updates with identical proportions.

## Common Make targets

Run `make help` for the full list. Most-used: `make build`, `make icons`, `make clean`, `make distclean`, `make setup`, `make package`.
