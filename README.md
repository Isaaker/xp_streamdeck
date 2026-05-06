# xp_streamdeck

Native Stream Deck plugin for X-Plane 12 on macOS, talking to the X-Plane Web API on `localhost:8086`.

## Prerequisites

- **X-Plane 12.1.1 or newer** — the built-in Web API was introduced in 12.1.1 and is enabled by default.
- Node.js 24 (pinned via `.nvmrc` — run `nvm use` in this directory).
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

- **DataRef Path** — the X-Plane DataRef, e.g. `sim/cockpit/autopilot/heading_mag`. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path. Without `[N]` an array DataRef shows its full contents (handy for picking the right index); with `[N]` only the indexed element is shown.
- **Label** — optional caption rendered above the value (e.g. `ALT`).
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

### DataRef Toggle

Two-state action that flips a DataRef value (or activates a CommandRef) on key press, and reflects the live state on the button by switching between two images. Use it for binary or near-binary controls (gear, flaps detents, lights, fuel pumps, …).

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef to read for the visible state. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path.
- **Value OFF** / **Value ON** — the two values that map to the OFF / ON image. Defaults to `0` / `1`. The visible state is chosen by closest distance to either value (or `≥ 0.5` for the default 0/1 case).
- **Trigger Mode** — `Write DataRef (toggle value)` writes the opposite value on each press. `Activate Command` instead fires a CommandRef on press (state still comes from the DataRef) — useful when the aircraft exposes a "toggle" command but the underlying DataRef is the actual state to display.
- **Command Path** — only used when *Trigger Mode* is `Activate Command`.
- **Image OFF** / **Image ON** — optional custom 144×144 PNG/JPG/SVG per state; uploads are downscaled to 144 px and persisted to disk so multi-state image switching stays reliable. Leave empty to use the default `imgs/states/{off,on}` images.

#### Example: gear handle

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/controls/gear_handle_down` |
| Value OFF | `0` |
| Value ON | `1` |
| Trigger Mode | `Write DataRef (toggle value)` |

Press → toggles gear up/down; the button flips between OFF/ON image as the DataRef actually changes.

#### Example: gear via command, state via DataRef

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit2/controls/gear_handle_down` |
| Trigger Mode | `Activate Command` |
| Command Path | `sim/flight_controls/landing_gear_toggle` |

Useful for aircraft where the gear command runs an animation/sound but the simple DataRef write would skip it.

### DataRef Write

Single-press action that writes a fixed numeric value to a DataRef. Use it when you want a button that *sets* a specific value (e.g. flaps to detent 2, parking brake to 1) rather than toggling.

Property Inspector fields:

- **DataRef Path** — the X-Plane DataRef to write. Supports array indexing (see [Array DataRefs](#array-datarefs)).
- **Live Value** — read-only preview of the current value while editing the path.
- **Value** — the numeric value written on press.
- **Label** — optional caption rendered above the live value (only used when *Show current value* is checked).
- **Show current value** — when checked, subscribes to the DataRef and renders its live value on the button title (same formatting pipeline as DataRef Display).
- **Format** / **Unit Scale** / **Precision** — printf formatting, only used when *Show current value* is checked. See [DataRef Display](#dataref-display) for details.
- **Hide green confirmation icon** — opt-out of the `showOk()` flash on success. Errors still always show the alert icon.

#### Example: parking brake on

| Field | Value |
| --- | --- |
| DataRef Path | `sim/flightmodel/controls/parkbrake` |
| Value | `1` |

#### Example: flaps to detent 2

| Field | Value |
| --- | --- |
| DataRef Path | `sim/flightmodel/controls/flaprqst` |
| Value | `0.5` |
| Show current value | *(checked)* |
| Format | `FLP %.0f%%` |
| Unit Scale | `100` |

### Array DataRefs

Some X-Plane DataRefs are arrays — one value per engine, per cylinder, per aerodynamic surface, etc. Examples:

- `sim/cockpit/engine/fuel_pump_on` — `int[16]`, one slot per engine.
- `sim/flightmodel/engine/ENGN_running` — `int[16]`, one per engine.
- `sim/cockpit2/switches/landing_lights_on` — `int[10]`.

Append `[N]` to the DataRef path in any of the three DataRef actions (Display, Toggle, Write) to address a single element. Without `[N]`, Display falls back to element `[0]` (legacy behaviour); Toggle and Write target the DataRef as a whole, which is fine for scalar DataRefs but unreliable for arrays — always use `[N]` when the DataRef is an array.

#### Example: fuel pump for engine 1

| Field | Value |
| --- | --- |
| DataRef Path | `sim/cockpit/engine/fuel_pump_on[0]` |
| Value OFF | `0` |
| Value ON | `1` |

The Toggle action reads only `fuel_pump_on[0]` for the visible state and writes only that index on press (via `PATCH …/value?index=0`); engines 2–16 stay untouched. To put each engine on its own key, drop the same action four times and change the index to `[0]` / `[1]` / `[2]` / `[3]`. All four share a single WebSocket subscription under the hood.

#### Live Value behaviour

In the Property Inspector's *Live Value* row:

- Path **without** `[N]` on an array DataRef → shows the entire array (e.g. `[0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0]`). Useful for figuring out which index does what before committing to one.
- Path **with** `[N]` → shows only that scalar.
- Path with `[N]` but DataRef is not an array → shows `not an array`.
- Path with `[N]` but `N` is out of range → shows `index N out of bounds (length M)`.

In all error cases the action tile shows the standard `?` not-found suffix at runtime, and Toggle/Write trigger `showAlert()` on press.

## Button icons

Button images shown on the Stream Deck are generated locally by a small TypeScript pipeline so the whole set stays visually consistent (same font size, same baseline, same LED-bar geometry across every icon).

```bash
make icons
```

Three kinds of icons are produced from a single catalog (`scripts/icons/catalog.ts`):

- **`toggle`** — for action buttons that flip a state (AP HDG mode, FD on/off, …). Generates an `_on` + `_off` pair: bold uppercase label centered, colored LED bar at the bottom (lit in the accent color when ON, dark grey when OFF, with a soft glow).
- **`display`** — for the **`dataref-display`** action (live X-Plane readouts: current altitude, wind, AP setpoints, …). Generates a single PNG: small caption + thin accent line in the top third, rest of the key left empty so Stream Deck's title overlay can render the live value cleanly underneath.
- **`nudge`** — for single-press command buttons that increment/decrement an AP setpoint (heading bug, altitude target, V/S, source). Generates a single PNG: bold label at the top, big filled triangle in the accent color pointing in the action direction. Pair with the `command` action (with `Hold Mode` for continuous spin).
- **`background`** — solid-color filler tile (no label, no accent). Generates a single PNG with the entire 144×144 painted in the entry's `color`. Useful as visual separators between functional clusters on the deck. Bundled set: black, white, yellow, red.

### Groups & color palette

Each catalog entry belongs to exactly one group. The group decides **both** the accent color **and** the output subdirectory — one color per group keeps the whole set visually calm and makes related buttons easy to find on disk.

| Group       | Accent  | Hex       | Contents                                                              |
| ----------- | ------- | --------- | --------------------------------------------------------------------- |
| `autopilot` | yellow  | `#eab308` | AP/FD/YD mode toggles, AP setpoint readouts, HDG/ALT/VS/SRC nudges    |
| `lights`    | green   | `#22c55e` | BCN, LAND, TAXI, NAV, STROBE                                          |
| `cockpit`   | green   | `#22c55e` | PARK BRK, FUEL PUMP, MASTER BAT, AVIONICS, PITOT HEAT                 |
| `readouts`  | white   | `#ffffff` | Live values: HDG, ALT, IAS, V/S, BARO, WIND, W SPD                    |
| `backgrounds` | n/a   | per entry | Solid-color filler tiles (`bg_black`, `bg_white`, `bg_yellow`, `bg_red`) |

The mapping lives in `GROUP_ACCENT` at the top of `scripts/icons/catalog.ts` — change a hex there and every icon in that group updates after the next `make icons`.

Output goes into one subdirectory per group:

```
out/icons/
├── autopilot/   # ap, fd, hdg, …, ap_hdg, ap_alt, …, hdg_left, hdg_right, alt_up, …
├── lights/      # lt_bcn_on/off, lt_land_on/off, …
├── cockpit/     # parkbrake_on/off, fuelpump_on/off, …
└── readouts/    # cur_hdg, cur_alt, cur_ias, …
```

Toggles produce `<name>_on.png` + `<name>_off.png`; displays and nudges produce a single `<name>.png`. All 144×144. The `out/` folder is gitignored and wiped by `make clean`.

### Adding a new icon

1. Open `scripts/icons/catalog.ts`.
2. Append a single entry to the `catalog` array, picking the `kind` and the `group`:

   ```ts
   // toggle button — color and output dir come from the group
   { kind: 'toggle',  name: 'apu',     label: 'APU', group: 'cockpit' },

   // live readout (header for the dataref-display action)
   { kind: 'display', name: 'cur_oat', label: 'OAT', group: 'readouts' },

   // nudge button (single press → CommandRef; arrow indicates direction)
   { kind: 'nudge',   name: 'crs_left', label: 'CRS', direction: 'left',  group: 'autopilot' },
   { kind: 'nudge',   name: 'crs_x2',   label: 'CRS', direction: 'right', double: true, group: 'autopilot' },

   // solid-color filler tile (no label, no accent — color comes from `color`)
   { kind: 'background', name: 'bg_orange', color: '#f59e0b', group: 'backgrounds' },
   ```

   - `kind` — `'toggle'` for on/off buttons, `'display'` for live-readout headers, `'nudge'` for single-press arrow buttons, `'background'` for plain-color filler tiles.
   - `name` — file-name stem; must be unique within its group. Output: `apu_on.png` + `apu_off.png` (toggle) or `cur_oat.png` / `crs_left.png` (display, nudge), inside the group's subdirectory.
   - `label` — text shown on the icon. **Toggle:** ≤ 4 chars renders at 44px; longer labels auto-shrink in fixed steps (5→36, 6→30, 7→26, 8→22, 9→20, 10+→18). **Display:** ≤ 6 characters comfortably (`AP HDG`, `W SPD`). **Nudge:** ≤ 4 characters (`HDG`, `SRC`, `ALT`, `VS`); the arrow is the visual focus.
   - `group` — one of `'autopilot'` / `'lights'` / `'cockpit'` / `'readouts'`. Drives **both** the accent color (see the table above) and the output subdirectory. To add a new group, extend the `IconGroup` type and `GROUP_ACCENT` map at the top of `catalog.ts`.
   - `direction` *(nudge only)* — `'up'` / `'down'` / `'left'` / `'right'`. Arrow points this way.
   - `double` *(nudge only, optional)* — `true` renders two stacked triangles for "coarse step" semantics (e.g. ALT ↑↑ for big increments).
   - `color` *(background only)* — hex fill for the entire tile. The group's accent is ignored for this kind.
3. Run `make icons`. The new files appear in `out/icons/<group>/`.
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
