import { action, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

// Decorative no-op tile. Holds a slot on the deck so the user can assign a
// generated background image; press does nothing, no feedback, no offline
// indicator — it stays inert in every state by design.
@action({ UUID: "com.robertw.xplane.background" })
export class XPlaneBackground extends SingletonAction<JsonObject> {}
