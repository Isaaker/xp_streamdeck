# xp_streamdeck — Release Notes

**Version:** 0.1.0 · **Platform:** macOS (Apple Silicon & Intel) · **X-Plane:** 12.1.1+

## What it is

`xp_streamdeck` is a native **Elgato Stream Deck plugin for X-Plane 12 on macOS**. It turns any key on a Stream Deck (tested on the Stream Deck XL) into a control surface for the simulator — toggle the gear, fire any CommandRef, write a DataRef, or display a live readout (altitude, heading, QNH, …) right on the key.

Under the hood the plugin talks to **X-Plane's built-in Web API** on `localhost:8086` (REST + WebSocket). There is **no custom XPLM C++ plugin to install** — X-Plane 12.1.1+ ships the API enabled by default, the plugin connects to it directly.

The motivation was simple: on Windows, [PilotsDeck](https://github.com/Fragtality/PilotsDeck) covers this need beautifully. On macOS there was no equivalent — only keyboard-shortcut workarounds. This project closes that gap.

## Features

- **Command** — trigger any X-Plane `CommandRef` on key press. Optional **Hold Mode** routes the press through the WebSocket `command_set_is_active` begin/end pair, so things like the heading bug keep spinning while the key is held.
- **Command + Display** — fire a `CommandRef` on press while showing a live `DataRef` value as the button title. Built for things like G1000 softkeys where the same key both triggers and displays state.
- **DataRef Display** — pure read-only live readout. `printf`-style formatting (`%s`, `%d`, `%.Nf`, …), optional unit scaling (e.g. radians→degrees, Pa→inHg), optional precision override.
- **DataRef Write** — single-press writes a fixed numeric value to a `DataRef` (e.g. parking brake to 1, flaps to detent 2). Optionally subscribes to the same `DataRef` and renders the live value on the button.
- **DataRef Toggle** — two-state button: the image follows the actual live `DataRef` value (closest-distance match between the two configured values), and the press either writes the opposite value or fires a `CommandRef`. Custom 144×144 PNG/JPG/SVG per state.
- **Background Tile** — decorative filler with no action; useful as visual separator between functional clusters on the deck.
- **Array DataRef support** — append `[N]` to any `DataRef` path in Display, Toggle and Write to address a single element (per-engine fuel pumps, per-light switches, etc.). The Property Inspector previews the full array when no index is given so you can pick the right one.
- **Property Inspector with live preview** — every action's editor shows the current `DataRef` value while you type the path, so you can verify before committing.
- **Centralized icon pipeline** (`make icons`) — generates a visually consistent button-icon set (toggle pairs, display headers, nudge arrows, solid background tiles) from a single TypeScript catalog. One row per icon, one accent color per group.

## Installation

This is a private/sideloaded plugin — not (yet) on the Stream Deck Marketplace. Install from source:

```bash
# 1. Clone
git clone git@github.com:rwellinger/xp_streamdeck.git
cd xp_streamdeck

# 2. Install dependencies (Node.js 24, see `.nvmrc`)
nvm use            # or: nvm install
make setup         # → npm install

# 3. Build
make build         # rollup → com.robertw.xplane.sdPlugin/bin/plugin.js

# 4. Link into the Stream Deck app and restart the plugin
npx streamdeck link com.robertw.xplane.sdPlugin
npx streamdeck restart com.robertw.xplane
```

After the restart, the **X-Plane** category appears in the Stream Deck app's action list with all six actions ready to drag onto a key.

Optional — generate the bundled icon set:

```bash
make icons         # → out/icons/<group>/*.png
```

For the full action reference (every Property Inspector field with worked examples — gear, parking brake, QNH in inHg, fuel pumps per engine, …) see [`README.md`](README.md).

## Requirements

| | |
|---|---|
| **Operating system** | macOS 12 or newer (plugin manifest pins `Platform: mac`, `MinimumVersion: 12`). |
| **X-Plane**          | **12.1.1 or newer** — the built-in Web API was introduced in 12.1.1 and is enabled by default. Older 12.x versions do **not** work. |
| **Stream Deck app**  | 7.1 or newer (per manifest `Software.MinimumVersion`). |
| **Hardware**         | Any Stream Deck device with a Keypad controller. Developed against the Stream Deck XL. |
| **Network**          | Both X-Plane and the Stream Deck app must run on the **same Mac** — the Web API is localhost-only by design (`http://localhost:8086`). No LAN setup, no port forwarding. |
| **Build toolchain**  | Node.js 24 (pinned via `.nvmrc`). The Elgato Stream Deck CLI is bundled as a devDependency — no global install needed. |

### X-Plane network configuration (mandatory)

X-Plane 12.1.1+ runs the Web API automatically — you do **not** need to flip any toggle in *Settings → Network* to turn it on. The toggles labelled *"iPhone, iPad and External Apps"* are unrelated; they control the legacy UDP interfaces.

The **only** relevant setting is opt-out:

> *Settings → Network → **Disable Incoming Traffic*** must remain **unchecked**.

If it is checked, every Web API call returns `403 Forbidden` and the plugin can't talk to X-Plane. Verify with:

```bash
curl -i 'http://localhost:8086/api/v3/datarefs/count'
# expect: HTTP/1.1 200 OK + JSON
```

A `403 Forbidden` means *Disable Incoming Traffic* is on — uncheck it and restart X-Plane.
A `Connection refused` means the Web API isn't running — check that you didn't launch X-Plane with `--no_web_server`.

## Known Limitations

- **macOS-tested only.** The plugin manifest currently lists `mac` as the only supported platform. Stream Deck plugins, Node.js, and the X-Plane Web API are all platform-agnostic, so the same code base **should also work on Windows** after adding a `windows` entry to `manifest.json` and rebuilding. **It has not been tested on Windows.** If you try it, **please open an issue** and report whether it works — happy to add Windows officially once someone has confirmed it on real hardware.
- **Web API port is hard-coded to `8086`.** If you start X-Plane with `--web_server_port=<N>` it will not reach the simulator. Configurable port is on the roadmap.
- **Sideload only — no notarization, not on the Stream Deck Marketplace.** Install from source as described above.
- **DataRef and Command numeric IDs are session-scoped.** When X-Plane restarts they change; the plugin re-resolves them automatically on the next call, but you may see a one-off log line per button after a sim restart. No user action needed.
- **No simultaneous remote use.** The Web API is bound to localhost; controlling X-Plane from a Stream Deck on a *different* machine is not supported.
- **Property Inspector checkbox defaults.** sdpi-components v4 checkboxes round-trip from "checked" to "unchecked" inconsistently across Stream Deck versions; the plugin works around this by treating *unchecked* as the baseline behavior on every checkbox setting (e.g. *Hide green confirmation icon* opts out of `showOk()` instead of opting in to it).
- **Hardware verification gap.** Day-to-day development happens on a laptop without a Stream Deck attached — the Stream Deck app + sideload covers ~90% of the surface, but final hardware verification of new actions happens on the flight-sim Mac, so a release may briefly contain quirks specific to the live device. Reports welcome.

## Support

- **Issues, bug reports, feature requests, Windows test reports:** <https://github.com/rwellinger/xp_streamdeck/issues>

When opening an issue, the following helps a lot:

- X-Plane version (`X-Plane → About`).
- macOS version (and Stream Deck app version, *Stream Deck → About*).
- Output of `curl -i 'http://localhost:8086/api/v3/datarefs/count'`.
- Last ~50 lines of `~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log` around the time of the problem.
- The action type and Property Inspector settings (DataRef path, format, …).
