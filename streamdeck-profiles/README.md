# Stream Deck Profiles #

Stream Desk XL Profiles only function together with the xp_streamdesk Plugin.

## Sync via `make` ##

Do **not** import/export these profiles through the Stream Deck UI — it creates
"Copy" duplicates with fresh UUIDs and breaks the cross-profile links in the
parent `X-Plane` profile.

* `make export` — snapshot live profiles (`xp_stream_*` and the `X-Plane`
  parent) from `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/`
  into this directory.
* `make import` — restore every `*.streamDeckProfile` in this directory back
  into `ProfilesV3/`, patching `Device.UUID` to the local Stream Deck hardware
  so it works on any Mac (dev laptop ↔ sim Mac).

Both commands quit and relaunch the Stream Deck app automatically. Folder
UUIDs are preserved, so the parent profile's child links stay intact.

### First-time setup on a new Mac

If the target Mac already has profiles with the same names but different
folder UUIDs (e.g. previously imported through the Stream Deck UI), the first
`make import` will produce **duplicates** — the old profiles stay, the new
ones from the repo land next to them. This is a one-time situation.

To clean it up:

1. In the Stream Deck app, delete every `xp_stream_*` profile **and** the
   `X-Plane` parent profile.
2. Run `make import`.
3. Open the `X-Plane` parent and re-link the one tile that points to Stream
   Deck's system "Default Profile" — that profile is intentionally not synced
   and has a different UUID on every Mac.

From then on every `git pull && make import` overwrites the same folder UUIDs
in place — no more duplicates, no more re-linking.

### Adding a new profile

Adding a new aircraft profile (e.g. B738):

1. **In the Stream Deck app:** create the new profile and name it
   `xp_stream_<aircraft>` — e.g. `xp_stream_b738`. The lowercase
   `xp_stream_` prefix is required; the sync filter ignores anything else.
2. Configure the pages and buttons.
3. In the `X-Plane` parent profile, add a new "Switch Profile" tile that
   points to the new profile.
4. Run `make export` and select **both** the new profile *and*
   `xp_stream_parent` — otherwise the sim Mac won't know about the link.
5. *(Optional)* add a `## <Aircraft>` block with features to this README.
6. Commit on a feature branch, open a PR, merge.

On the sim Mac: `git pull && make import` picks up the new profile and the
updated parent automatically — the new tile works on first launch because
folder UUIDs are preserved across machines.

## X-Plane Menu Profile

This is a default Profile where all profiles are included. Required to link all profiles together. The import/export mechanism supports this on the sync.

Filename: xp_stream_parent.streamDeckProfile

## G1000 - X-Plane Default X1000 (G1000) ##

Filename: xp_stream_g1000.streamDeckProfile

Plugin Version Required: 1.1.0.0 or newer

### Features: ###

* Garmin Default Autopilot
* PFD and MFD Support
* GCU (Alpha & Numeric)
* Cockpit Views


## Cessna 172 SP by X-Plane ##

Filename: xp_stream_c172sp.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views

## Lancair Evolution by X-Plane ##

The aircraft from "Austin Meyer"

Filename: xp_stream_lancair.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views


## Piper PA-46 M500 by X-Aerodynamics ##

Filename: xp_stream_pa46.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Full Overhead Panel
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views

## Diamond DA42 and DA62 by Aerobask ##

Filename: xp_stream_da42.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views


## Diamond DA20 / DV20 by Aerobask ##

Filename: xp_stream_dv20.streamDeckProfile

Plugin Version Required: 1.4.1.0 or newer

### Features: ###

* Default Cockpit Buttons
* DV20 Autopilot
* Garmin 430 Support
* Skyview Touch Support
* Cockpit Views



## UL Shark by Aerobask ##

Filename: xp_stream_shark.streamDeckProfile

Plugin Version Required: 1.3.1.0 or newer

### Features: ###

* Default Cockpit Buttons
* DV20 Autopilot
* Garmin 430 Support
* Skyview Touch Support
* Cockpit Views

## Phenom 300 by Aerobask ##

Filename: xp_stream_ph300.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Phenom Cockpit Buttons
* Phenom Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Ground Procedures (Cold&Dark)
* Cockpit Views

## Pilatus PC12 by Thranda (G1000 Version) ##

I use the PC12 from Thranda in G1000 Configuration on the Mac because better experience with the MAP and Flight Planning.

Filename: xp_stream_pc12.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* PC12 Overhead and Cockpit Buttons
* PC12 Autopilot
* Shows some Engine indicators
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Ground Procedures (Cold&Dark)
* Cockpit Views

## EuroCopter EC130 (Garmin 430 Edition) ##

Filename: xp_stream_ec130.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* EC130 Cockpit Buttons
* EC130 and Hover Assistent Autopilot Support
* Shows some Engine indicators
* Garmin 430 Support
* Ground Procedures (Cold&Dark)
* Cockpit Views

## AW-109 SP 2.0

Please Note: This Profile is still in development and not finish and complete tested.

Filename: xp_stream_aw109.streamDeckProfile

Plugin Version Required: 1.4.1.0 or newer (Uses the new Display Selector)

### Features: ###

* AW109 Cockpit Buttons
* AW109 Autopilot
* Overhead and Ground
* Shows some Engine indicators
* Ground Procedures (Cold&Dark)
* Cockpit Views
