export type IconGroup =
	| "autopilot"
	| "lights"
	| "cockpit"
	| "readouts"
	| "backgrounds"
	| "g1000"
	| "views";

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
	views: "#3b82f6", // blue — saved cockpit view recall buttons
};

type IconBase = {
	name: string;
	label: string;
	group: IconGroup;
};

// Optional `sublabel` stacks a second line below the main label (used for
// twin-engine pairs like ALT/L, ALT/R, START/L, START/R — keeps the L/R
// designator readable instead of squeezing "START L" into 26px inline).
export type ToggleIcon = IconBase & { kind: "toggle"; sublabel?: string };
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
// Compact directional arrow + label, lower 2/3 reserved for the Stream Deck
// title overlay. Used by the `rotary` action: each button fires a step
// command in one direction while showing the live DataRef value as title.
// Visually a hybrid of `nudge` (small arrow hint) and `display` (empty
// readout area).
export type NudgeDisplayIcon = {
	kind: "nudge-display";
	name: string;
	label: string;
	group: IconGroup;
	direction: "up" | "down" | "left" | "right";
};
// G1000-style dual-concentric rotary knob indicator. `outer` is the big
// outer ring (coarse adjustment), `inner` is the small inner knob (fine
// adjustment). cw/ccw is the rotation direction. `push` is the click-the-
// knob action — concentric ring with a center dot, no rotation arrow.
export type KnobIcon = {
	kind: "knob";
	name: string;
	group: IconGroup;
	variant: "outer-cw" | "outer-ccw" | "inner-cw" | "inner-ccw" | "push";
	// Only honored by the `push` variant; renders a caption above the symbol.
	label?: string;
};
// Solid-color filler tile — no label, no accent, just the fill.
export type BackgroundIcon = {
	kind: "background";
	name: string;
	group: IconGroup;
	color: string;
};
// G1000 GCU keypad button — solid dark tile, oversized bold character
// centered. No accent stripe or border; the character is the icon.
export type GcuKeyIcon = IconBase & { kind: "gcu_key" };
// Cockpit view recall buttons — tiny "COCKPIT VIEW" header, oversized
// number centered (01..20). Single-press command tile with blue accent.
export type ViewIcon = {
	kind: "view";
	name: string;
	number: number;
	group: IconGroup;
};
export type IconDef =
	| ToggleIcon
	| DisplayIcon
	| NudgeIcon
	| NudgeDisplayIcon
	| CommandIcon
	| KnobIcon
	| BackgroundIcon
	| GcuKeyIcon
	| ViewIcon;

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
	{ kind: "knob", name: "hdg_sync", variant: "push", label: "HDG SYNC", group: "autopilot" },
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
	{ kind: "toggle", name: "nolabel", label: "", group: "cockpit" },
	{ kind: "toggle", name: "parkbrake", label: "PARK BRK", group: "cockpit" },
	{ kind: "toggle", name: "master_bat", label: "MASTER BAT", group: "cockpit" },
	{ kind: "toggle", name: "master_alt", label: "MASTER ALT", group: "cockpit" },
	{ kind: "toggle", name: "efis", label: "EFIS", group: "cockpit" },
	{ kind: "toggle", name: "avionics", label: "AVIONICS", group: "cockpit" },
	{ kind: "toggle", name: "pitot_heat", label: "PITOT HEAT", group: "cockpit" },
	{ kind: "toggle", name: "fuelpump", label: "FUEL PUMP", group: "cockpit" },
	{ kind: "toggle", name: "motor_start", label: "MAGN START", group: "cockpit" },
	// Twin-engine variants: stacked label + L/R designator
	{ kind: "toggle", name: "alt_l", label: "ALT", sublabel: "L", group: "cockpit" },
	{ kind: "toggle", name: "alt_r", label: "ALT", sublabel: "R", group: "cockpit" },
	{ kind: "toggle", name: "start_l", label: "START", sublabel: "L", group: "cockpit" },
	{ kind: "toggle", name: "start_r", label: "START", sublabel: "R", group: "cockpit" },
	// Shark
	{ kind: "toggle", name: "master", label: "MASTER", group: "cockpit" },
	{ kind: "toggle", name: "efis", label: "EFIS", group: "cockpit" },
	{ kind: "toggle", name: "apilot", label: "AUTO PILOT", group: "cockpit" },
	{ kind: "toggle", name: "flaps", label: "FLAPS", group: "cockpit" },
	{ kind: "toggle", name: "trim", label: "TRIM", group: "cockpit" },
	{ kind: "toggle", name: "landg", label: "LANDGEAR", group: "cockpit" },
	{ kind: "toggle", name: "prop", label: "PROP", group: "cockpit" },
	{ kind: "toggle", name: "mag1", label: "MAG 1", group: "cockpit" },
	{ kind: "toggle", name: "mag2", label: "MAG 2", group: "cockpit" },

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

	// === Rotary (small directional arrow + label, lower ⅔ reserved for setTitle) ===
	// Pair these to drive multi-position rotary switches (e.g. magneto OFF/R/L/BOTH/START)
	// or continuous tuners (COM/NAV frequency, FMS cursor). Use them with the `rotary` action.
	{
		kind: "nudge-display",
		name: "magneto_ccw",
		label: "MAG",
		direction: "left",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "magneto_cw",
		label: "MAG",
		direction: "right",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "flaps_up",
		label: "FLAPS",
		direction: "up",
		group: "cockpit",
	},
	{
		kind: "nudge-display",
		name: "flaps_down",
		label: "FLAPS",
		direction: "down",
		group: "cockpit",
	},
	{ kind: "nudge-display", name: "freq_mhz_up", label: "MHz", direction: "up", group: "g1000" },
	{
		kind: "nudge-display",
		name: "freq_mhz_down",
		label: "MHz",
		direction: "down",
		group: "g1000",
	},
	{ kind: "nudge-display", name: "freq_khz_up", label: "kHz", direction: "up", group: "g1000" },
	{
		kind: "nudge-display",
		name: "freq_khz_down",
		label: "kHz",
		direction: "down",
		group: "g1000",
	},

	// === Plain-color background tiles (no label, no accent) ===
	// Useful as filler/separators between functional clusters on the deck.
	{ kind: "background", name: "bg_black", color: "#000000", group: "backgrounds" },
	{ kind: "background", name: "bg_white", color: "#ffffff", group: "backgrounds" },
	{ kind: "background", name: "bg_yellow", color: "#ffeb00", group: "backgrounds" },
	{ kind: "background", name: "bg_red", color: "#ef4444", group: "backgrounds" },
	{ kind: "background", name: "bg_green", color: "#22c55e", group: "backgrounds" },
	{ kind: "background", name: "bg_orange", color: "#f59e0b", group: "backgrounds" },
	{ kind: "background", name: "bg_blue", color: "#3b82f6", group: "backgrounds" },

	// === G1000 — text command buttons (orange accent) ===
	{ kind: "command", name: "g_menu", label: "MENU", group: "g1000" },
	{ kind: "command", name: "g_fpl", label: "FPL", group: "g1000" },
	{ kind: "command", name: "g_clr", label: "CLR", group: "g1000" },
	{ kind: "command", name: "g_ent", label: "ENT", group: "g1000" },
	{ kind: "command", name: "g_cdi", label: "CDI", group: "g1000" },
	{ kind: "command", name: "g_msg", label: "MSG", group: "g1000" },
	{ kind: "command", name: "g_vnav", label: "VNAV", group: "g1000" },
	{ kind: "command", name: "g_obs", label: "OBS", group: "g1000" },
	{ kind: "command", name: "g_proc", label: "PROC", group: "g1000" },
	{ kind: "command", name: "g_direct", label: "-D→", group: "g1000" },
	{ kind: "command", name: "g_navcom", label: "<->", group: "g1000" },

	// === G1000 — labelless directional arrows (cursor / list navigation) ===
	{ kind: "nudge", name: "g_up", direction: "up", group: "g1000" },
	{ kind: "nudge", name: "g_down", direction: "down", group: "g1000" },
	{ kind: "nudge", name: "g_left", direction: "left", group: "g1000" },
	{ kind: "nudge", name: "g_right", direction: "right", group: "g1000" },

	// === G1000 — dual-concentric rotary knob indicators ===
	{ kind: "knob", name: "g_outer_left", variant: "outer-ccw", group: "g1000" },
	{ kind: "knob", name: "g_outer_right", variant: "outer-cw", group: "g1000" },
	{ kind: "knob", name: "g_inner_left", variant: "inner-ccw", group: "g1000" },
	{ kind: "knob", name: "g_inner_right", variant: "inner-cw", group: "g1000" },
	{ kind: "knob", name: "g_push", variant: "push", group: "g1000" },

	// === G1000 GCU — keypad buttons (digits, letters, special keys) ===
	{ kind: "gcu_key", name: "gcu_0", label: "0", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_1", label: "1", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_2", label: "2", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_3", label: "3", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_4", label: "4", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_5", label: "5", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_6", label: "6", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_7", label: "7", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_8", label: "8", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_9", label: "9", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_a", label: "A", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_b", label: "B", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_c", label: "C", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_d", label: "D", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_e", label: "E", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_f", label: "F", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_g", label: "G", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_h", label: "H", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_i", label: "I", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_j", label: "J", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_k", label: "K", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_l", label: "L", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_m", label: "M", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_n", label: "N", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_o", label: "O", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_p", label: "P", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_q", label: "Q", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_r", label: "R", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_s", label: "S", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_t", label: "T", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_u", label: "U", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_v", label: "V", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_w", label: "W", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_x", label: "X", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_y", label: "Y", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_z", label: "Z", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_plusminus", label: "+/-", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_dot", label: ".", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_spc", label: "SPC", group: "g1000" },
	{ kind: "gcu_key", name: "gcu_bksp", label: "BKSP", group: "g1000" },

	// === Cockpit view recall (1..20) — blue tiles, big number, "COCKPIT VIEW" header ===
	...Array.from(
		{ length: 20 },
		(_, i): ViewIcon => ({
			kind: "view",
			name: `cockpit_view_${String(i + 1).padStart(2, "0")}`,
			number: i + 1,
			group: "views",
		}),
	),
];
