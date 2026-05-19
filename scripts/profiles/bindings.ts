// Maps Stream Deck profile slots → icon slugs under out/icons/.
//
// A rule fires when:
//   1. action `UUID` matches `uuid` exactly, AND
//   2. every key in `match` is present in the action's `Settings` with the
//      same string value (deep-equal for primitives only).
//
// First match wins. `icons` is keyed by state index (0/1/…) and points to a
// slug under out/icons/, e.g. "cockpit/park_brk_on" → out/icons/cockpit/park_brk_on.png.
//
// The `background` action has no `Image` in its manifest States[] (the plugin
// renders the tile at runtime), so it is never matched here.
//
// Seed this table from `npm run profile:inspect`, which dumps every unique
// (uuid, settings) fingerprint found across all .streamDeckProfile files.

export type BindingRule = {
	uuid: string;
	match: Record<string, string | number | boolean>;
	icons: Record<number, string>;
};

export const BINDINGS: BindingRule[] = [
	// Populate from `npm run profile:inspect` output.
	// Example:
	// {
	// 	uuid: "com.robertw.xplane.dataref-toggle",
	// 	match: { datarefPath: "sim/cockpit2/controls/parking_brake_ratio" },
	// 	icons: { 0: "cockpit/park_brk_off", 1: "cockpit/park_brk_on" },
	// },
];

export function findBinding(
	uuid: string,
	settings: Record<string, unknown>,
): BindingRule | undefined {
	for (const rule of BINDINGS) {
		if (rule.uuid !== uuid) continue;
		let ok = true;
		for (const [key, expected] of Object.entries(rule.match)) {
			if (settings[key] !== expected) {
				ok = false;
				break;
			}
		}
		if (ok) return rule;
	}
	return undefined;
}
