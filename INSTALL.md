# Installation Guide

This package contains everything needed to use the X-Plane Stream Deck plugin on macOS.

## What's Inside

| Entry | Purpose |
| --- | --- |
| `com.robertw.xplane.streamDeckPlugin` | The Stream Deck plugin bundle. |
| `profiles/` | Pre-built Stream Deck profiles (one `.streamDeckProfile` per aircraft). |
| `icons/` | Button icon library, grouped by function (`autopilot`, `cockpit`, `lights`, `readouts`, `g1000`, `backgrounds`). |
| `README.md` | Full developer / reference documentation (action types, DataRef formatting, icon pipeline, …). |
| `INSTALL.md` | This file. |

## Prerequisites

- **macOS 12 or newer** — the plugin runs on Mac only.
- **Stream Deck app 7.1+** — download from <https://www.elgato.com/downloads>.
- **X-Plane 12.1.1 or newer** — the built-in Web API on `localhost:8086` is enabled by default. The only relevant setting:
  - *X-Plane → Settings → Network → **Disable Incoming Traffic*** must remain **unchecked**.

Quick check that the X-Plane Web API is reachable:

```bash
curl -i http://localhost:8086/api/v3/datarefs/count
```

Expected: `HTTP/1.1 200 OK` plus a JSON body. `403` means *Disable Incoming Traffic* is checked; `Connection refused` means X-Plane isn't running or was started with `--no_web_server`.

## Step 1 — Install the Plugin

1. Double-click **`com.robertw.xplane.streamDeckPlugin`**.
2. The Stream Deck app opens and prompts to install the plugin — confirm.
3. The **X-Plane** category appears in the actions list on the right.

> **First-time Gatekeeper warning?** The plugin is not Apple-notarized (private/free distribution). If macOS refuses to open the file on first launch, right-click `com.robertw.xplane.streamDeckPlugin` in Finder → **Open** → confirm in the dialog. As a fallback, remove the quarantine attribute from a terminal:
>
> ```bash
> xattr -d com.apple.quarantine com.robertw.xplane.streamDeckPlugin
> ```

## Step 2 — Import a Profile (optional but recommended)

For each `.streamDeckProfile` inside `profiles/`:

1. Double-click the file (e.g. `profiles/xp_stream_c172sp.streamDeckProfile`).
2. The Stream Deck app prompts to import — confirm.
3. Switch to the new profile from the profile selector at the top of the Stream Deck app.

Available profiles in this release:

- `xp_stream_c172sp.streamDeckProfile` — Cessna 172 Skyhawk
- `xp_stream_da42.streamDeckProfile` — Diamond DA42
- `xp_stream_dv20.streamDeckProfile` — Diamond DV20
- `xp_stream_g1000.streamDeckProfile` — G1000 Avionics (generic)
- `xp_stream_pa46.streamDeckProfile` — Piper PA46
- `xp_stream_pc12.streamDeckProfile` — Pilatus PC-12
- `xp_stream_ph300.streamDeckProfile` — Embraer Phenom 300
- `xp_stream_shark.streamDeckProfile` — Shark Aero Shark

## Step 3 — Verify

1. Start X-Plane and load any aircraft.
2. Press a button on the Stream Deck — the corresponding action triggers in X-Plane.
3. Live readouts (HDG, ALT, IAS, BARO, …) update at roughly 10 Hz.

If a button shows a red `!`, check the plugin log:

```bash
tail -f ~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log
```

## Customizing Buttons

The `icons/` directory contains the same icons used by the bundled profiles, organized by function. Use them when building your own profile or extending an imported one.

| Folder | Contents |
| --- | --- |
| `icons/autopilot/` | AP / FD / YD toggles, AP setpoint readouts, HDG / ALT / V/S / SRC nudges |
| `icons/cockpit/` | Parking brake, fuel pump, master battery, avionics, pitot heat |
| `icons/lights/` | Beacon, landing, taxi, NAV, strobe |
| `icons/readouts/` | Live values (HDG, ALT, IAS, V/S, BARO, WIND, W SPD) |
| `icons/g1000/` | G1000 GCU keys |
| `icons/backgrounds/` | Solid-color filler tiles for visual separation |

To assign an icon and action to a key in the Stream Deck app:

1. Select the key in the layout.
2. Drag any PNG from `icons/<group>/` onto the key's image slot.
3. From the **X-Plane** category, drop the matching action onto the key:
   - **Command** — fire any X-Plane CommandRef on press (e.g. `sim/operation/pause_toggle`).
   - **Command + Display** — fire a CommandRef and show a live DataRef as the title.
   - **DataRef Display** — show a live DataRef value as the title (read-only).
   - **DataRef Write** — write a fixed numeric value to a DataRef on press.
   - **DataRef Toggle** — two-state button: image follows the live DataRef, click toggles it.
   - **Background Tile** — decorative, no action.
4. Configure the action's path (e.g. `sim/cockpit/autopilot/heading_mag`) in the inspector on the right.

See `README.md` for the full action reference, including array DataRef syntax (`[N]`), printf formatting, and unit-conversion recipes.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| All buttons show `!` | X-Plane Web API unreachable | Verify with the `curl` command above. Check *Disable Incoming Traffic* is unchecked and X-Plane is running. |
| Plugin not visible in actions list | Install didn't complete | Re-run Step 1; quit and re-open the Stream Deck app. |
| Live readouts stuck / blank | Plugin lost the WebSocket connection | Check `~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log`. Restart X-Plane and the Stream Deck app. |
| Profile won't import | Stream Deck app version too old | Update the Stream Deck app to 7.1 or newer. |

## Uninstall

In the Stream Deck app: right-click the **X-Plane** entry in the actions list (or in *Preferences → Plugins*) → **Uninstall**.
