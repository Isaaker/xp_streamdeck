# M09 — Clean-Code Refactor (Phase B + Phase C)

**Status:** Phase A + D done on branch `refactor/clean-code-utils-base-class` (pushed, pending Sim-Mac verification). Phase B + C unstarted.
**Estimated effort:** Phase B ~1 h, Phase C ~2–3 h.
**Depends on:** Phase A + D landed and verified on Sim-Mac (no behavioural regressions on any action).

## Context

This milestone continues a clean-code refactor scoped during a planning session on 2026-05-18. The full plan lives at `/Users/robertw/.claude/plans/im-aspekt-clean-code-modular-rossum.md`. Phase A (utils extraction) and Phase D (rename + offline-doc) are already on the branch in four commits:

```
6894770  docs: shared helpers and state naming conventions
59cdcd5  rename UNINITIALIZED_STATE, doc offline + util layering
2e7085d  centralize timings and float tolerance in const.ts
ade86d2  extract string normalization to util/settings
3d9259d  extract value coercion helpers to util/coerce
```

Phase A and D are pure mechanical extractions and renames — `make check` is green between every step. They've been pushed but not yet verified on the Sim-Mac with X-Plane running.

## Goal

Finish the planned refactor by:
- **Phase B**: removing the duplicated image-upload logic in the two Property Inspectors that have it.
- **Phase C**: introducing a `SubscribableAction` base class for the three display-only actions that share an identical subscription/render lifecycle.

After M09 ships, the actions directory shrinks by ~150–200 LOC and the next display-style action becomes a ~50-LOC subclass instead of a ~200-LOC copy.

## Scope (in)

### Phase B — PI image-upload helpers
- Extend `com.robertw.xplane.sdPlugin/ui/xplane-pi-helpers.js` with:
  - `window.XPlanePI.resizeToPng(dataUrl, targetSize = 144)` — canvas resize + encode to PNG data URL.
  - `window.XPlanePI.wireImageUpload({ input, thumb, clearButton, settingKey })` — attach listeners, persist via the existing `updateSetting()` cache.
- Reuse the existing `updateSetting()` cache layer in `xplane-pi-helpers.js:61-75` (that's the heavy lifting; it's already centralized).
- Delete the in-file copies from:
  - `com.robertw.xplane.sdPlugin/ui/dataref-toggle.html` — lines ~148-302 (resizeToPng, readAsDataURL, setThumb, local cached/updateSetting blocks, file-input wiring).
  - `com.robertw.xplane.sdPlugin/ui/guarded-command.html` — lines ~145-238 (same blocks).
- **Keep** the mode-visibility wiring in `dataref-toggle.html:219-244` — that's PI-specific (not a generic concern).

### Phase C — `SubscribableAction<TSettings, TState>` base class
- New file `src/actions/base/subscribable-action.ts` with:
  - `abstract class SubscribableAction<TSettings extends JsonObject, TState extends SubscribableState<TSettings>> extends SingletonAction<TSettings>`
  - Owns: `states: Map<string, TState>`, the `xplane` client wiring, subscription lifecycle (`applySubscription` / `dropSubscription`), offline/online handlers.
  - Subclasses implement: `createState(ev)`, `updateStateFromSettings(state, ev)` (returns `{ pathChanged }`), `render(state)`.
  - Error-feedback contract documented in a doc-comment on the class: `onKeyDown` errors → `showAlert()` (subclass responsibility); subscribe rejection / applyIndex throw → `setNotFound` (here); X-Plane offline → `setOffline` (here). Never gated by settings.
- Migrate these 3 actions onto the base class:
  - `src/actions/dataref-display.ts`
  - `src/actions/command-display.ts` — keep its `onKeyDown` for the command trigger; only the subscription lifecycle moves to the base.
  - `src/actions/dataref-write.ts` — base class subscription kicks in only when `showCurrentValue === true`. Simplest fit is `pathOf(settings)` returning `""` when the subscription is unwanted; the base treats `""` as no-op.

### Scope (out) — DO NOT migrate
These actions have their own state machines or shapes and must stay structurally unchanged. They already consume the new utils from Phase A.
- `dataref-toggle.ts` — has `renderPromise` serialization (Stream Deck SDK quirk), `inflightKeyDown` guard, seeded REST read, multi-state mapping.
- `guarded-command.ts` — long-press / repeat-timer / lock-state machine.
- `rotary.ts` — dial events (`onDialRotate` / `onDialDown`), hold-on-last-position logic, enum LUT parsing.
- `multi-dataref-display.ts` — 3-slot array shape.
- `wind-display.ts` — 3-slot array shape.
- `command.ts` — no subscription.
- `background.ts` — trivial.

## Deliverables

- `com.robertw.xplane.sdPlugin/ui/xplane-pi-helpers.js` — extended with `resizeToPng` and `wireImageUpload`.
- Slimmed `dataref-toggle.html` and `guarded-command.html` (image-upload section reduces to ~10 lines each).
- New `src/actions/base/subscribable-action.ts`.
- `dataref-display.ts`, `command-display.ts`, `dataref-write.ts` reduced to ~50–80 LOC subclasses.
- Each phase as its own commit (Phase B = 1 commit; Phase C = 1 commit per migrated action so each is independently reverable).

## Acceptance Criteria

- [ ] `make check` green between every step (Biome lint + `tsc --noEmit`).
- [ ] Phase B: opening the PI for `dataref-toggle` and `guarded-command` in the Stream Deck app on dev laptop — upload a custom OFF + ON image, click Reset in the PI, reopen → images persist (this is the regression the original cache layer fixed).
- [ ] Phase C: each of the three migrated actions still behaves identically when X-Plane is running on the Sim-Mac:
  - `dataref-display` — gear-down DataRef updates the title.
  - `command-display` — key press triggers the command; the linked DataRef subscription continues to update the title.
  - `dataref-write` with `showCurrentValue=true` — subscription updates title; key press writes the value.
- [ ] X-Plane Pause+Quit cycle: all three migrated tiles show offline tile, resume → tile clears within ~3s (`OFFLINE_DELAY_MS`).
- [ ] No comment-rot: any `// removed X` or backwards-compat shims removed cleanly.

## Verification Steps

1. **Phase B — dev laptop (no Stream Deck hardware needed):**
   ```bash
   make check
   make build              # rolls plugin bundle
   ```
   Open Stream Deck app, drag `dataref-toggle` onto a button, click the gear → PI opens.
   - Upload an OFF image → thumbnail appears, settings round-trip (check via re-opening PI).
   - Repeat for ON image.
   - Click Reset → settings clear cleanly.
   - Repeat for `guarded-command`.
2. **Phase C — Sim-Mac (X-Plane running):**
   - Commit + push each migration; pull on Sim-Mac.
   - For each of `dataref-display`, `command-display`, `dataref-write`:
     - Live value updates on the tile.
     - Settings change in PI triggers immediate re-render (label, format, unit scale).
     - X-Plane → File → Quit. Tile shows offline. Restart X-Plane. Tile clears within ~3s.
3. **`make check`** must pass at every commit.

## Risk Notes

- **Phase B risk: low**. PI scripts are loaded by the Stream Deck app at runtime; failures surface as a broken PI dialog. The `updateSetting()` cache (the part that previously broke) is *not* being moved — only the upload + resize wrappers around it. Roll back per-file if needed.
- **Phase C risk: low-medium**. Three actions migrate to a shared base class. A bug in the base affects all three. Mitigate by committing one migration per commit so reverts are surgical. Run the verification matrix above for each migrated action *separately* on Sim-Mac before committing the next migration.
- If `dataref-write`'s "subscription only when showCurrentValue" doesn't fit cleanly via `pathOf(settings)` returning `""`, fall back to keeping that action out of Phase C — the win comes from `dataref-display` + `command-display` alone.

## Where Things Live

- Full plan with file-by-file change list: `/Users/robertw/.claude/plans/im-aspekt-clean-code-modular-rossum.md`
- Branch: `refactor/clean-code-utils-base-class` (already pushed to `origin`).
- Phase A+D commits range: `3d9259d..6894770` (4 commits).
- New shared modules from Phase A — documented in CLAUDE.md → "Shared Helpers".

## Outstanding Pre-Phase-B Verification

Before starting Phase B, verify Phase A+D on the Sim-Mac:
- `git fetch && git checkout refactor/clean-code-utils-base-class && make build && reload Stream Deck`.
- Run every action type once with X-Plane up. No behavior change expected — pure refactor.
- If anything diverges from `main`: bisect with `git bisect` across the 4 Phase A+D commits; each is small and well-scoped.
