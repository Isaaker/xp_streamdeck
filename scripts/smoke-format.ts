/**
 * Manual smoke test for src/util/format.ts. Run with: `npm run smoke:format`.
 *
 * Walks through the M04 acceptance scenarios (heading, altitude, m/s → kt)
 * plus a few edge cases. Exits with a non-zero status if any case fails.
 */

import { formatDataRefValue } from "../src/util/format";
import type { DataRefValue } from "../src/xplane";

interface Case {
	name: string;
	value: DataRefValue;
	opts: Parameters<typeof formatDataRefValue>[1];
	expected: string;
}

const cases: Case[] = [
	{
		name: "heading bug %.0f°",
		value: 119.6,
		opts: { format: "%.0f°" },
		expected: "120°",
	},
	{
		name: "altitude %.0f ft",
		value: 5000,
		opts: { format: "%.0f ft" },
		expected: "5000 ft",
	},
	{
		name: "groundspeed m/s → kt",
		value: 100,
		opts: { format: "%.0f kt", unitScale: 1.94384 },
		expected: "194 kt",
	},
	{
		name: "default %s on number",
		value: 42,
		opts: {},
		expected: "42",
	},
	{
		name: "%s with precision option formats number",
		value: 12.345,
		opts: { format: "%s", precision: 2 },
		expected: "12.35",
	},
	{
		name: "%d truncates",
		value: 7.9,
		opts: { format: "%d" },
		expected: "7",
	},
	{
		name: "%.2f overrides precision option",
		value: 1.23456,
		opts: { format: "%.2f", precision: 4 },
		expected: "1.23",
	},
	{
		name: "%f default precision is 6",
		value: 1,
		opts: { format: "%f" },
		expected: "1.000000",
	},
	{
		name: "boolean as %s",
		value: true,
		opts: { format: "%s" },
		expected: "true",
	},
	{
		name: "boolean as %d",
		value: false,
		opts: { format: "%d" },
		expected: "0",
	},
	{
		name: "array picks first element for %d",
		value: [3, 4, 5],
		opts: { format: "%d" },
		expected: "3",
	},
	{
		name: "literal %% escape",
		value: 50,
		opts: { format: "%.0f%%" },
		expected: "50%",
	},
	{
		name: "string value passthrough",
		value: "ON",
		opts: { format: "%s" },
		expected: "ON",
	},
];

let failed = 0;
for (const c of cases) {
	const actual = formatDataRefValue(c.value, c.opts);
	const ok = actual === c.expected;
	const status = ok ? "PASS" : "FAIL";
	console.log(
		`[${status}] ${c.name} → ${JSON.stringify(actual)} (expected ${JSON.stringify(c.expected)})`,
	);
	if (!ok) failed++;
}

if (failed > 0) {
	console.error(`\n${failed} case(s) failed`);
	process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed`);
