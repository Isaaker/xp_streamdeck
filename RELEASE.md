XP_STREAMDECK — RELEASE NOTES
=============================

Version 0.1.0
Platform:  macOS (Apple Silicon and Intel)
X-Plane:   12.1.1 or newer
Stream Deck app: 7.1 or newer


WHAT IT IS
----------

xp_streamdeck is a native Elgato Stream Deck plugin for X-Plane 12 on macOS.
It turns any key on a Stream Deck (developed and tested on the Stream Deck XL)
into a control surface for the simulator: toggle the gear, fire any CommandRef,
write a DataRef, or display a live readout (altitude, heading, QNH, ...) right
on the key.

Under the hood the plugin talks to X-Plane's built-in Web API on
localhost:8086 (REST + WebSocket). There is NO custom XPLM C++ plugin to
install. X-Plane 12.1.1+ ships the API enabled by default and the plugin
connects to it directly.

The motivation: on Windows, PilotsDeck covers this need beautifully. On macOS
there was no equivalent, only keyboard-shortcut workarounds. This project
closes that gap.


FEATURES
--------

The plugin ships with six action types you can drop on any Stream Deck key:

  - Command
        Trigger any X-Plane CommandRef on key press. Optional Hold Mode
        routes the press through the WebSocket begin/end pair, so things
        like the heading bug keep spinning while the key is held.

  - Command + Display
        Fire a CommandRef on press while showing a live DataRef value as
        the button title. Built for things like G1000 softkeys where the
        same key both triggers and displays state.

  - DataRef Display
        Pure read-only live readout. printf-style formatting (%s, %d,
        %.Nf, ...), optional unit scaling (e.g. radians to degrees,
        Pa to inHg), optional precision override.

  - DataRef Write
        Single-press writes a fixed numeric value to a DataRef (e.g.
        parking brake to 1, flaps to detent 2). Optionally subscribes
        to the same DataRef and renders the live value on the button.

  - DataRef Toggle
        Two-state button: the image follows the actual live DataRef
        value, and the press either writes the opposite value or fires
        a CommandRef. Custom 144x144 PNG/JPG/SVG per state.

  - Background Tile
        Decorative filler with no action. Useful as visual separator
        between functional clusters on the deck.

Additional capabilities:

  - Array DataRef support: append [N] to any DataRef path in Display,
    Toggle and Write to address a single element (per-engine fuel
    pumps, per-light switches, etc.).

  - Property Inspector with live preview: every action's editor shows
    the current DataRef value while you type the path, so you can
    verify before committing.

  - Bundled icon set: visually consistent button icons for autopilot
    modes, lights, cockpit switches, and live readouts.


INSTALLATION
------------

Two files are needed and both can be downloaded directly from the project
page:

  1. com.robertw.xplane.streamDeckPlugin    (the plugin itself)
  2. xp_stream_c172sp.streamDeckProfile     (a ready-to-use C172 SP profile)

Step 1 — Install the plugin

  Double-click "com.robertw.xplane.streamDeckPlugin".
  The Stream Deck app opens and asks whether to install the X-Plane plugin.
  Confirm. After a few seconds the X-Plane category appears in the left-hand
  action list of the Stream Deck app, with all six actions ready to drag onto
  a key.

Step 2 — Import the C172 SP profile (recommended starting point)

  Double-click "xp_stream_c172sp.streamDeckProfile".
  The Stream Deck app asks which device the profile should be imported into.
  Pick your Stream Deck and confirm. The profile is a fully wired-up layout
  for the default Cessna 172 SP that ships with X-Plane 12 — autopilot
  modes, lights, fuel pump, parking brake, gear, live readouts.

Step 3 — Start X-Plane 12 and load the C172 SP

  Launch X-Plane 12 (12.1.1 or newer) and load the default C172 SP. As soon
  as the aircraft is in the world, the Stream Deck buttons start reflecting
  the real cockpit state — and pressing a button drives the sim.

  IMPORTANT: X-Plane and the Stream Deck app must run on the SAME Mac.
  The Web API the plugin talks to is localhost-only by design.

If you want to build your own profile from scratch instead, just skip step 2;
all six actions are available in the Stream Deck app's action list once
step 1 is done.


REQUIREMENTS
------------

Operating system
        macOS 12 or newer.

X-Plane
        12.1.1 or newer. The built-in Web API was introduced in 12.1.1
        and is enabled by default. Older 12.x versions do NOT work.

Stream Deck app
        7.1 or newer.

Hardware
        Any Stream Deck device with a Keypad controller. Developed and
        tested on the Stream Deck XL.

Network
        Both X-Plane and the Stream Deck app must run on the SAME Mac.
        The Web API is localhost-only by design (http://localhost:8086).
        No LAN setup, no port forwarding.


X-PLANE NETWORK CONFIGURATION (mandatory)
-----------------------------------------

X-Plane 12.1.1+ runs the Web API automatically. You do NOT need to flip
any toggle in Settings -> Network to turn it on. The toggles labelled
"iPhone, iPad and External Apps" are unrelated; they control the legacy
UDP interfaces.

The ONLY relevant setting is opt-out:

        Settings -> Network -> Disable Incoming Traffic
        must remain UNCHECKED.

If it is checked, every Web API call returns 403 Forbidden and the plugin
cannot talk to X-Plane.

Quick verification from a terminal:

        curl -i 'http://localhost:8086/api/v3/datarefs/count'

Expected: HTTP/1.1 200 OK followed by a small JSON document.

If you see 403 Forbidden, "Disable Incoming Traffic" is on — uncheck it
and restart X-Plane.

If you see "Connection refused", the Web API is not running — make sure
you did not launch X-Plane with --no_web_server, and that you really are
on 12.1.1 or newer.


KNOWN LIMITATIONS
-----------------

  - macOS-tested only.
        The plugin manifest currently lists "mac" as the only supported
        platform. The underlying technology — Stream Deck plugins,
        Node.js, and the X-Plane Web API — is platform-agnostic, so the
        same code base SHOULD also work on Windows after adding a
        "windows" entry to the manifest and rebuilding. It has NOT been
        tested on Windows. If anyone tries it: please open an issue and
        report whether it works. Happy to add Windows officially once
        someone has confirmed it on real hardware.

  - Web API port is hard-coded to 8086.
        If you start X-Plane with --web_server_port=<N> the plugin will
        not reach the simulator. Configurable port is on the roadmap.

  - Sideload only.
        Not on the Stream Deck Marketplace yet. Install via the
        downloadable .streamDeckPlugin file as described above.

  - Same-Mac only.
        Controlling X-Plane from a Stream Deck attached to a DIFFERENT
        machine on the network is not supported (Web API is bound to
        localhost).

  - DataRef and Command numeric IDs are session-scoped.
        When X-Plane restarts they change. The plugin re-resolves them
        automatically on the next call, but you may see a one-off log
        line per button after a sim restart. No user action needed.

  - Profile is for the C172 SP.
        The shipped xp_stream_c172sp.streamDeckProfile is wired up for
        the default Cessna 172 SP. For other aircraft the actions still
        work, but DataRef and CommandRef paths may differ — you'll want
        to build a custom layout for that aircraft.


SUPPORT
-------

Issues, bug reports, feature requests, and Windows test reports:

        https://github.com/rwellinger/xp_streamdeck/issues

When opening an issue the following helps a lot:

  - X-Plane version (X-Plane -> About).
  - macOS version and Stream Deck app version (Stream Deck -> About).
  - Output of:
        curl -i 'http://localhost:8086/api/v3/datarefs/count'
  - Last ~50 lines of:
        ~/Library/Logs/ElgatoStreamDeck/com.robertw.xplane*.log
    around the time of the problem.
  - The action type and Property Inspector settings (DataRef path,
    format, ...) of the button that misbehaves.
