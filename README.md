# xp_streamdeck

Native Stream Deck plugin for X-Plane 12 on macOS, talking to the X-Plane Web API on `localhost:8086`.

## Build & install (development)

```bash
npm install
npm run build
streamdeck link com.robertw.xplane.sdPlugin
streamdeck restart com.robertw.xplane
```

After this, the **X-Plane → Pause** action appears in the Stream Deck app's action list. Drop it onto a key, press it, and X-Plane toggles pause (`sim/operation/pause_toggle`).
