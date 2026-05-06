export type IconGroup = "autopilot" | "lights" | "cockpit" | "readouts" | "backgrounds" | "g1000";

// One accent color per functional group — keeps the whole set visually calm.
// The group name is also the output subdirectory (out/icons/<group>/).
// `backgrounds` is a non-functional bucket: solid color tiles used as filler
// or visual separators on the deck. Its accent is unused (background icons
// carry their color explicitly per entry); the value here is just a
// placeholder so the Record stays exhaustive.
export const GROUP_ACCENT: Record<IconGroup, string> = {
	autopilot: "#ffeb00", // yellow
	lights: "#22c55e", // green
	cockpit: "#22c55e", // green
	readouts: "#ffffff", // white
	backgrounds: "#000000", // unused — background tiles carry their own color
	g1000: "#f59e0b", // orange — Garmin-style amber for G1000 command/knob buttons
};

type IconBase = {
	name: string;
	label: string;
	group: IconGroup;
};

export type ToggleIcon = IconBase & { kind: "toggle" };
export type DisplayIcon = IconBase & { kind: "display" };
// `label` is optional so we can render bare directional arrows (e.g. G1000
// cursor-up) — when absent the triangle centers vertically on the canvas.
export type NudgeIcon = {
	kind: "nudge";
	name: string;
	label?: string;
	group: IconGroup;
	direction: "up" | "down" | "left" | "right";
	double?: boolean;
};
// Single-press text button (no on/off state). Same label DNA as toggle but
// with a thin static accent stripe instead of the toggle's LED bar — signals
// "action ready" rather than "togglable".
export type CommandIcon = IconBase & { kind: "command" };
// G1000-style dual-concentric rotary knob indicator. `outer` is the big
// outer ring (coarse adjustment), `inner` is the small inner knob (fine
// adjustment). cw/ccw is the rotation direction. `push` is the click-the-
// knob action — concentric ring with a center dot, no rotation arrow.
export type KnobIcon = {
	kind: "knob";
	name: string;
	group: IconGroup;
	variant: "outer-cw" | "outer-ccw" | "inner-cw" | "inner-ccw" | "push";
};
// Solid-color filler tile — no label, no accent, just the fill.
export type BackgroundIcon = {
	kind: "background";
	name: string;
	group: IconGroup;
	color: string;
};
export type IconDef =
	| ToggleIcon
	| DisplayIcon
	| NudgeIcon
	| CommandIcon
	| KnobIcon
	| BackgroundIcon;

export const catalog: IconDef[] = [
	// === Autopilot — mode toggles ===
	{ kind: "toggle", name: "ap", label: "AP", group: "autopilot" },
	{ kind: "toggle", name: "fd", label: "FD", group: "autopilot" },
	{ kind: "toggle", name: "yaw", label: "YD", group: "autopilot" },
	{ kind: "toggle", name: "hdg", label: "HDG", group: "autopilot" },
	{ kind: "toggle", name: "nav", label: "NAV", group: "autopilot" },
	{ kind: "toggle", name: "up", label: "UP", group: "autopilot" },
	{ kind: "toggle", name: "dwn", label: "DWN", group: "autopilot" },
	{ kind: "toggle", name: "alt", label: "ALT", group: "autopilot" },
	{ kind: "toggle", name: "vs", label: "V/S", group: "autopilot" },
	{ kind: "toggle", name: "flc", label: "FLC", group: "autopilot" },
	{ kind: "toggle", name: "vnav", label: "VNAV", group: "autopilot" },
	{ kind: "toggle", name: "apr", label: "APR", group: "autopilot" },
	{ kind: "toggle", name: "bc", label: "BC", group: "autopilot" },

	// === Autopilot — setpoint readouts (live values: AP HDG, AP ALT, …) ===
	{ kind: "display", name: "ap_hdg", label: "AP HDG", group: "autopilot" },
	{ kind: "display", name: "ap_alt", label: "AP ALT", group: "autopilot" },
	{ kind: "display", name: "ap_vs", label: "AP V/S", group: "autopilot" },
	{ kind: "display", name: "ap_src", label: "AP SRC", group: "autopilot" },

	// === Autopilot — nudge buttons (single press → CommandRef) ===
	{ kind: "nudge", name: "hdg_left", label: "HDG", direction: "left", group: "autopilot" },
	{ kind: "nudge", name: "hdg_right", label: "HDG", direction: "right", group: "autopilot" },
	{ kind: "nudge", name: "src_left", label: "SRC", direction: "left", group: "autopilot" },
	{ kind: "nudge", name: "src_right", label: "SRC", direction: "right", group: "autopilot" },
	{ kind: "nudge", name: "alt_up", label: "ALT", direction: "up", group: "autopilot" },
	{
		kind: "nudge",
		name: "alt_up_x2",
		label: "ALT",
		direction: "up",
		double: true,
		group: "autopilot",
	},
	{ kind: "nudge", name: "alt_down", label: "ALT", direction: "down", group: "autopilot" },
	{
		kind: "nudge",
		name: "alt_down_x2",
		label: "ALT",
		direction: "down",
		double: true,
		group: "autopilot",
	},
	{ kind: "nudge", name: "vs_up", label: "VS", direction: "up", group: "autopilot" },
	{ kind: "nudge", name: "vs_down", label: "VS", direction: "down", group: "autopilot" },

	// === Lights (toggles) — `lt_` prefix avoids clashing with AP "nav" ===
	{ kind: "toggle", name: "lt_bcn", label: "BCN", group: "lights" },
	{ kind: "toggle", name: "lt_land", label: "LAND", group: "lights" },
	{ kind: "toggle", name: "lt_taxi", label: "TAXI", group: "lights" },
	{ kind: "toggle", name: "lt_nav", label: "NAV", group: "lights" },
	{ kind: "toggle", name: "lt_strobe", label: "STROBE", group: "lights" },

	// === Cockpit controls / system switches (toggles) ===
	{ kind: "toggle", name: "parkbrake", label: "PARK BRK", group: "cockpit" },
	{ kind: "toggle", name: "master_bat", label: "MASTER BAT", group: "cockpit" },
	{ kind: "toggle", name: "master_alt", label: "MASTER ALT", group: "cockpit" },
	{ kind: "toggle", name: "avionics", label: "AVIONICS", group: "cockpit" },
	{ kind: "toggle", name: "pitot_heat", label: "PITOT HEAT", group: "cockpit" },
	{ kind: "toggle", name: "fuelpump", label: "FUEL PUMP", group: "cockpit" },
	{ kind: "toggle", name: "motor_start", label: "MAGN START", group: "cockpit" },

	// === Live readouts (display-only, no on/off) ===
	// Layout reserves the lower 2/3 of the key for the Stream Deck title overlay.
	{ kind: "display", name: "cur_hdg", label: "HDG", group: "readouts" },
	{ kind: "display", name: "cur_alt", label: "ALT", group: "readouts" },
	{ kind: "display", name: "cur_ias", label: "IAS", group: "readouts" },
	{ kind: "display", name: "cur_spd", label: "SPD", group: "readouts" },
	{ kind: "display", name: "cur_vs", label: "V/S", group: "readouts" },
	{ kind: "display", name: "cur_baro", label: "W-BARO", group: "readouts" },
	{ kind: "display", name: "wind_dir", label: "W-DIR", group: "readouts" },
	{ kind: "display", name: "wind_spd", label: "W-SPD", group: "readouts" },
	{ kind: "display", name: "wind_temp", label: "W-TEMP", group: "readouts" },

	// === Plain-color background tiles (no label, no accent) ===
	// Useful as filler/separators between functional clusters on the deck.
	{ kind: "background", name: "bg_black", color: "#000000", group: "backgrounds" },
	{ kind: "background", name: "bg_white", color: "#ffffff", group: "backgrounds" },
	{ kind: "background", name: "bg_yellow", color: "#ffeb00", group: "backgrounds" },
	{ kind: "background", name: "bg_red", color: "#ef4444", group: "backgrounds" },
	{ kind: "background", name: "bg_green", color: "#22c55e", group: "backgrounds" },

	// === G1000 — text command buttons (orange accent) ===
	{ kind: "command", name: "g_menu", label: "MENU", group: "g1000" },
	{ kind: "command", name: "g_fpl", label: "FPL", group: "g1000" },
	{ kind: "command", name: "g_clr", label: "CLR", group: "g1000" },
	{ kind: "command", name: "g_ent", label: "ENT", group: "g1000" },
	{ kind: "command", name: "g_proc", label: "PROC", group: "g1000" },
	{ kind: "command", name: "g_direct", label: "→D→", group: "g1000" },
	{ kind: "command", name: "g_navcom", label: "NAV⇄COM", group: "g1000" },

	// === G1000 — labelless up arrow (cursor / list navigation) ===
	{ kind: "nudge", name: "g_up", direction: "up", group: "g1000" },

	// === G1000 — dual-concentric rotary knob indicators ===
	{ kind: "knob", name: "g_outer_left", variant: "outer-ccw", group: "g1000" },
	{ kind: "knob", name: "g_outer_right", variant: "outer-cw", group: "g1000" },
	{ kind: "knob", name: "g_inner_left", variant: "inner-ccw", group: "g1000" },
	{ kind: "knob", name: "g_inner_right", variant: "inner-cw", group: "g1000" },
	{ kind: "knob", name: "g_push", variant: "push", group: "g1000" },
];
