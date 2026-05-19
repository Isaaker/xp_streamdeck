// Maps Stream Deck profile slots → icon slugs under out/icons/.
//
// Two layers:
//   1. PATTERNS — regex on commandPath/datarefPath for serial families
//      (quick_look_*, gcu478/A-Z, g1000n3_*, autopilot/heading_*, …).
//   2. DIRECT — flat lookup for slots whose mapping is not pattern-able
//      (aircraft-specific datarefs, AP mode toggles disambiguated by cmd).
//
// Lookup order at runtime: PATTERNS first, then DIRECT. First match wins.
// `bindings.ts` is consulted *after* this — it stays as a per-slot override
// for ambiguous edge cases (e.g. nav_off hash collision between groups).
//
// Slugs that don't exist in out/icons/ will surface at apply time as
// `missing-icon: <slug>` so wrong mappings here fail loud.
//
// TODO verify markers below = my best guess from settings + catalog; please
// check these in particular before committing.

const TOGGLE_UUID = "com.robertw.xplane.dataref-toggle";
const COMMAND_UUID = "com.robertw.xplane.command";
const DISPLAY_UUID = "com.robertw.xplane.dataref-display";
const MULTI_DISPLAY_UUID = "com.robertw.xplane.multi-dataref-display";
const CMD_DISPLAY_UUID = "com.robertw.xplane.command-display";
const ROTARY_UUID = "com.robertw.xplane.rotary";
const WIND_UUID = "com.robertw.xplane.wind-display";
const GUARDED_UUID = "com.robertw.xplane.guarded-command";

export type PatternRule = {
	uuid: string;
	pathField: "commandPath" | "datarefPath";
	pattern: RegExp;
	slugs: (match: RegExpMatchArray, settings: Record<string, unknown>) => Record<number, string>;
};

export type DirectRule = {
	uuid: string;
	match: Record<string, string>;
	slugs: Record<number, string>;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");
const single = (slug: string): Record<number, string> => ({ 0: slug });
const toggleSlugs = (base: string): Record<number, string> => ({
	0: `${base}_off`,
	1: `${base}_on`,
});
const guardedSlugs = (base: string): Record<number, string> => ({
	0: `${base}_locked`,
	1: `${base}_unlocked`,
});

export const PATTERNS: PatternRule[] = [
	// View commands: sim/view/quick_look_N (N=0..19) → views/cockpit_view_<N+1, padded>
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/view\/quick_look_(\d+)$/,
		slugs: (m) => single(`views/cockpit_view_${pad2(Number(m[1]) + 1)}`),
	},
	// GCU478 letter keys: sim/GPS/gcu478/<A-Z> → g1000/gcu_<a-z>
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/gcu478\/([A-Z])$/,
		slugs: (m) => single(`g1000/gcu_${m[1].toLowerCase()}`),
	},
	// GCU478 digit keys: sim/GPS/gcu478/<0-9> → g1000/gcu_<0-9>
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/gcu478\/(\d)$/,
		slugs: (m) => single(`g1000/gcu_${m[1]}`),
	},
	// GCU478 special keys
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/gcu478\/(dot|spc|bksp)$/,
		slugs: (m) => single(`g1000/gcu_${m[1]}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/gcu478\/minus$/,
		slugs: () => single("g1000/gcu_plusminus"),
	},
	// G1000n3 (MFD) standard text-button commands
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_(clr|ent|menu|proc|fpl|direct|cdi|msg|vnav|obs)$/,
		slugs: (m) => single(`g1000/g_${m[1]}`),
	},
	// G1000n3 FMS knob — outer ring CW/CCW
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_fms_outer_(up|down)$/,
		slugs: (m) => single(`g1000/g_outer_${m[1] === "up" ? "right" : "left"}`),
	},
	// G1000n3 FMS knob — inner ring CW/CCW
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_fms_inner_(up|down)$/,
		slugs: (m) => single(`g1000/g_inner_${m[1] === "up" ? "right" : "left"}`),
	},
	// G1000n3 cursor button → g1000/g_push (the "push" knob action)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_cursor$/,
		slugs: () => single("g1000/g_push"),
	},
	// G1000n3 range zoom: up→g_up, down→g_down (TODO verify: maybe better g_outer_*)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_range_(up|down)$/,
		slugs: (m) => single(`g1000/g_${m[1]}`),
	},
	// G1000n3 softkeys 1..12 → readouts/eng_blank (generic; user sets title in SD App)
	// TODO verify: there may be a more specific slug for these (e.g. a dedicated softkey tile)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n3_softkey\d+$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// G1000n1 softkeys 1..12 → same generic
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_softkey\d+$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// G1000n1 ALT outer/inner knob
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_alt_outer_(up|down)$/,
		slugs: (m) => single(`g1000/g_outer_${m[1] === "up" ? "right" : "left"}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_alt_inner_(up|down)$/,
		slugs: (m) => single(`g1000/g_inner_${m[1] === "up" ? "right" : "left"}`),
	},
	// G1000n1 NAV outer/inner knob
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_nav_outer_(up|down)$/,
		slugs: (m) => single(`g1000/g_outer_${m[1] === "up" ? "right" : "left"}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_nav_inner_(up|down)$/,
		slugs: (m) => single(`g1000/g_inner_${m[1] === "up" ? "right" : "left"}`),
	},
	// G1000n1 COM outer/inner knob (with/without _833 suffix)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_com_outer_(up|down)(_833)?$/,
		slugs: (m) => single(`g1000/g_outer_${m[1] === "up" ? "right" : "left"}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_com_inner_(up|down)(_833)?$/,
		slugs: (m) => single(`g1000/g_inner_${m[1] === "up" ? "right" : "left"}`),
	},
	// G1000n1 frequency flip-flop (COM ↔, NAV ↔)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_(com|nav)_ff$/,
		slugs: () => single("g1000/g_navcom"),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_(com12|nav12)$/,
		slugs: () => single("g1000/g_navcom"),
	},
	// G1000n1 nose up/down (V/S) — autopilot pitch nudge
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g1000n1_nose_(up|down)$/,
		slugs: (m) => single(`autopilot/vs_${m[1]}`),
	},
	// Standard autopilot heading nudge: heading_up → hdg_right, heading_down → hdg_left
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/autopilot\/heading_(up|down)$/,
		slugs: (m) => single(`autopilot/hdg_${m[1] === "up" ? "right" : "left"}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/autopilot\/heading_sync$/,
		slugs: () => single("autopilot/hdg_sync"),
	},
	// Standard AP altitude / VS / airspeed nudges
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/autopilot\/altitude_(up|down)$/,
		slugs: (m) => single(`autopilot/alt_${m[1]}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/autopilot\/vertical_speed_(up|down)$/,
		slugs: (m) => single(`autopilot/vs_${m[1]}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/autopilot\/airspeed_(up|down)$/,
		slugs: (m) => single(`autopilot/spd_${m[1]}`),
	},
	// OBS up/down (radio) — TODO verify: using g1000/g_obs as static icon for both
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/radios\/obs1_(up|down)$/,
		slugs: () => single("g1000/g_obs"),
	},
	// G430n1 (Garmin GNS 430, DV20) — map to G1000 equivalents where they match
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_(clr|ent|menu|proc|fpl|direct|cdi|msg|vnav|obs)$/,
		slugs: (m) => single(`g1000/g_${m[1]}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_cursor$/,
		slugs: () => single("g1000/g_push"),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_(com|nav)_ff$/,
		slugs: () => single("g1000/g_navcom"),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_nav_com_tog$/,
		slugs: () => single("g1000/g_navcom"),
	},
	// G430n1 outer/inner knob (coarse=outer, fine=inner)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_coarse_(up|down)$/,
		slugs: (m) => single(`g1000/g_outer_${m[1] === "up" ? "right" : "left"}`),
	},
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_fine_(up|down)$/,
		slugs: (m) => single(`g1000/g_inner_${m[1] === "up" ? "right" : "left"}`),
	},
	// G430n1 chapter/page → g_up/g_down (TODO verify: list navigation)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_(chapter|page)_(up|dn)$/,
		slugs: (m) => single(`g1000/g_${m[2] === "up" ? "up" : "down"}`),
	},
	// G430n1 zoom in/out — TODO verify (no dedicated zoom icons)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/g430n1_zoom_(in|out)$/,
		slugs: (m) => single(`g1000/g_${m[1] === "in" ? "up" : "down"}`),
	},
	// Aerobask "otto" AP nudges — same semantics as sim/autopilot/altitude_*
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/otto\/alt_(up|dn)$/,
		slugs: (m) => single(`autopilot/alt_${m[1] === "up" ? "up" : "down"}`),
	},
	// Aerobask "otto" AP pitch nudges (ap_up/ap_dn = nose pitch via AP)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/otto\/ap_(up|dn)$/,
		slugs: (m) => single(`autopilot/vs_${m[1] === "up" ? "up" : "down"}`), // TODO verify
	},
	// Aerobask SkyView softkeys (DV20) — generic blank tile, label via setTitle
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/skyview\/[12]\/softkey\d+$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// Aerobask SkyView joystick directions (Ljoy/Rjoy + X/Y/U/L/P/R/D)
	// All map to bare arrows; user can override per direction if needed.
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/skyview\/[12]\/(L|R)joy[XYULPRD]$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// Aerobask HSI source nudges
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/skyview\/[12]\/hsi_src_(up|dn)$/,
		slugs: (m) => single(`autopilot/src_${m[1] === "up" ? "right" : "left"}`),
	},
	// Transponder mode commands — generic blank, label via setTitle
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/transponder\/transponder_(off|standby|on|alt|ground|ident)$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// GCU xpdr key
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/GPS\/gcu478\/xpdr$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// Thranda PC12 generic buttons / switches — command-style (no DataRef)
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^thranda\/buttons\/Button\d+$/,
		slugs: () => single("cockpit/nolabel_cmd"),
	},
	// Thranda PC12 toggles using switches/Switch[Up|Dn]NN as commandPath
	{
		uuid: TOGGLE_UUID,
		pathField: "commandPath",
		pattern: /^thranda\/switches\/Switch(Up|Dn)\d+$/,
		slugs: () => toggleSlugs("cockpit/nolabel"),
	},
	// Thranda PC12 button-based toggles (datarefPath driven, generic visual)
	{
		uuid: TOGGLE_UUID,
		pathField: "commandPath",
		pattern: /^thranda\/buttons\/Button\d+$/,
		slugs: () => toggleSlugs("cockpit/nolabel"),
	},
	// PA-46 / MD generic switches → blank rotary tile (user sets label via setTitle)
	{
		uuid: ROTARY_UUID,
		pathField: "commandPath",
		pattern: /^pa46\/switches\/.+$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// Aerobask aircraft-specific engine knobs → blank rotary (user labels via setTitle)
	{
		uuid: ROTARY_UUID,
		pathField: "commandPath",
		pattern: /^aerobask\/(engines|press|lights|test)\/.+$/,
		slugs: () => single("readouts/eng_blank"),
	},
	// Starter commands — single-press (not guarded); use generic blank
	{
		uuid: COMMAND_UUID,
		pathField: "commandPath",
		pattern: /^sim\/starters\/engage_starter_\d+$/,
		slugs: () => single("readouts/eng_blank"),
	},
];

export const DIRECT: DirectRule[] = [
	// ─── DataRef Toggles — standard X-Plane datarefs ──────────────────────────
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/controls/parking_brake_ratio" },
		slugs: toggleSlugs("cockpit/parkbrake"),
	},
	// Lights
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/nav_lights_on" },
		slugs: toggleSlugs("lights/lt_nav"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/strobe_lights_on" },
		slugs: toggleSlugs("lights/lt_strobe"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/beacon_lights_on" },
		slugs: toggleSlugs("lights/lt_bcn"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/landing_lights_on" },
		slugs: toggleSlugs("lights/lt_land"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/taxi_light_on" },
		slugs: toggleSlugs("lights/lt_taxi"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/switches/landing_lights_on" },
		slugs: toggleSlugs("lights/lt_land"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/switches/strobe_lights_on" },
		slugs: toggleSlugs("lights/lt_strobe"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/switches/beacon_on" },
		slugs: toggleSlugs("lights/lt_bcn"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/switches/navigation_lights_on" },
		slugs: toggleSlugs("lights/lt_nav"),
	},
	// Electrical / Avionics
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/battery_array_on[0]" },
		slugs: toggleSlugs("cockpit/master_bat"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/avionics_on" },
		slugs: toggleSlugs("cockpit/avionics"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/generator_on[0]" },
		slugs: toggleSlugs("cockpit/alt_l"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/electrical/generator_on[1]" },
		slugs: toggleSlugs("cockpit/alt_r"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/electrical/generator_on[0]" },
		slugs: toggleSlugs("cockpit/alt_l"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/electrical/generator_on[1]" },
		slugs: toggleSlugs("cockpit/alt_r"),
	},
	// Pitot heat
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/switches/pitot_heat_on" },
		slugs: toggleSlugs("cockpit/pitot_heat"),
	},
	// Yaw damper
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/switches/yaw_damper_on" },
		slugs: toggleSlugs("autopilot/yaw"),
	},
	// Fuel pump
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/engine/fuel_pump_on[0]" },
		slugs: toggleSlugs("cockpit/fuelpump"),
	},
	// Gear
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/controls/gear_handle_down" },
		slugs: toggleSlugs("cockpit/landg"),
	},
	// Ignition
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/engine/igniters_on[0]" },
		slugs: toggleSlugs("cockpit/mag1"),
	},
	// ─── Autopilot mode toggles — disambiguated by commandPath ────────────────
	// HDG status → autopilot/hdg toggle
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_status",
			commandPath: "sim/autopilot/heading",
		},
		slugs: toggleSlugs("autopilot/hdg"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_status",
			commandPath: "aerobask/otto/ap_hdg",
		},
		slugs: toggleSlugs("autopilot/hdg"),
	},
	// NAV mode (heading_mode dataref, hdg_nav command) → autopilot/nav
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_mode",
			commandPath: "sim/autopilot/hdg_nav",
		},
		slugs: toggleSlugs("autopilot/nav"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_mode",
			commandPath: "aerobask/otto/ap_nav",
		},
		slugs: toggleSlugs("autopilot/nav"),
	},
	// VNAV (heading_mode + g1000n1_vnv / otto/ap_vnav) → autopilot/vnav
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_mode",
			commandPath: "sim/GPS/g1000n1_vnv",
		},
		slugs: toggleSlugs("autopilot/vnav"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/heading_mode",
			commandPath: "aerobask/otto/ap_vnav",
		},
		slugs: toggleSlugs("autopilot/vnav"),
	},
	// ALT mode → autopilot/alt
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/altitude_mode",
			commandPath: "sim/GPS/g1000n1_alt",
		},
		slugs: toggleSlugs("autopilot/alt"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/altitude_mode",
			commandPath: "aerobask/otto/ap_alt_hold",
		},
		slugs: toggleSlugs("autopilot/alt"),
	},
	// FLC mode → autopilot/flc
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/altitude_mode",
			commandPath: "sim/GPS/g1000n1_flc",
		},
		slugs: toggleSlugs("autopilot/flc"),
	},
	// VS mode → autopilot/vs
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/altitude_mode",
			commandPath: "sim/GPS/g1000n1_vs",
		},
		slugs: toggleSlugs("autopilot/vs"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/altitude_mode",
			commandPath: "aerobask/otto/ap_vvi",
		},
		slugs: toggleSlugs("autopilot/vs"),
	},
	// APR (approach) → autopilot/apr
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/approach_status",
			commandPath: "sim/GPS/g1000n1_apr",
		},
		slugs: toggleSlugs("autopilot/apr"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/approach_status",
			commandPath: "aerobask/otto/ap_app",
		},
		slugs: toggleSlugs("autopilot/apr"),
	},
	// Backcourse → autopilot/bc
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/backcourse_on",
			commandPath: "sim/GPS/g1000n1_bc",
		},
		slugs: toggleSlugs("autopilot/bc"),
	},
	// AP master (autopilot_on_or_cws + servos_toggle / otto/ap_toggle) → autopilot/ap
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/autopilot_on_or_cws",
			commandPath: "sim/autopilot/servos_toggle",
		},
		slugs: toggleSlugs("autopilot/ap"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/autopilot_on_or_cws",
			commandPath: "aerobask/otto/ap_toggle",
		},
		slugs: toggleSlugs("autopilot/ap"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/autopilot_on",
			commandPath: "sim/GPS/g1000n3_ap",
		},
		slugs: toggleSlugs("autopilot/ap"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/autopilot/autopilot_on",
			commandPath: "sim/autopilot/servos_toggle",
		},
		slugs: toggleSlugs("autopilot/ap"),
	},
	// FD (autopilot_mode + fdir_toggle / otto/fd_toggle) → autopilot/fd
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit/autopilot/autopilot_mode",
			commandPath: "sim/autopilot/fdir_toggle",
		},
		slugs: toggleSlugs("autopilot/fd"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit/autopilot/autopilot_mode",
			commandPath: "aerobask/otto/fd_toggle",
		},
		slugs: toggleSlugs("autopilot/fd"),
	},
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit/autopilot/autopilot_mode",
			commandPath: "sim/autopilot/fdir_servos_toggle",
		},
		slugs: toggleSlugs("autopilot/fd"),
	},
	// BANK limit → autopilot/bank
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit2/annunciators/autopilot_bank_limit",
			commandPath: "sim/autopilot/bank_limit_toggle",
		},
		slugs: toggleSlugs("autopilot/bank"),
	},
	// Yaw damper via sim/systems/yaw_damper_toggle
	{
		uuid: TOGGLE_UUID,
		match: {
			datarefPath: "sim/cockpit/switches/yaw_damper_on",
			commandPath: "sim/systems/yaw_damper_toggle",
		},
		slugs: toggleSlugs("autopilot/yaw"),
	},
	// ─── DataRef Displays — standard X-Plane datarefs ─────────────────────────
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/autopilot/heading_mag" },
		slugs: single("autopilot/ap_hdg"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/autopilot/altitude" },
		slugs: single("autopilot/ap_alt"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/autopilot/vertical_velocity" },
		slugs: single("autopilot/ap_vs"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/autopilot/airspeed" },
		slugs: single("autopilot/ap_spd"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/radios/nav1_obs_degm" },
		slugs: single("autopilot/ap_src"), // TODO verify: OBS is a course selector, ap_src is the closest match
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit2/engine/indicators/N1_percent[0]" },
		slugs: single("readouts/eng_ng"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/flightmodel/engine/ENGN_TRQ[0]" },
		slugs: single("readouts/eng_trq"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/flightmodel/engine/ENGN_ITT_c[0]" },
		slugs: single("readouts/eng_itt"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit2/engine/indicators/prop_speed_rpm[0]" },
		slugs: single("readouts/eng_np"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/weather/aircraft/qnh_pas" },
		slugs: single("readouts/cur_baro"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/weather/aircraft/barometer_current_pas" },
		slugs: single("readouts/cur_baro"),
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/pressure/cabin_altitude_actual_ft" },
		slugs: single("readouts/eng_blank"), // TODO verify: no cabin-altitude icon; using blank
	},
	{
		uuid: DISPLAY_UUID,
		match: { datarefPath: "sim/cockpit/radios/gps_dme_speed_kts" },
		slugs: single("readouts/cur_spd"), // TODO verify: DME ground speed
	},
	// ─── Multi-DataRef Displays — disambiguated by title ──────────────────────
	{
		uuid: MULTI_DISPLAY_UUID,
		match: { title: "Speed" },
		slugs: single("readouts/cur_spd"), // TODO verify: multi-slot speed display
	},
	{
		uuid: MULTI_DISPLAY_UUID,
		match: { title: "COM 1" },
		slugs: single("readouts/eng_blank"), // TODO verify: COM1 active+standby readout
	},
	{
		uuid: MULTI_DISPLAY_UUID,
		match: { title: "COM 2" },
		slugs: single("readouts/eng_blank"), // TODO verify
	},
	{
		uuid: MULTI_DISPLAY_UUID,
		match: { title: "NAV1" },
		slugs: single("readouts/eng_blank"), // TODO verify
	},
	{
		uuid: MULTI_DISPLAY_UUID,
		match: { title: "" },
		slugs: single("readouts/eng_blank"), // TODO verify: untitled multi-display
	},
	// ─── Command-Display (fires + shows live value) ───────────────────────────
	{
		uuid: CMD_DISPLAY_UUID,
		match: {
			datarefPath: "sim/flightmodel2/engines/N1_percent[0]",
			commandPath: "aerobask/eng/master1_to",
		},
		slugs: single("readouts/eng_ng"), // TODO verify: DA42 left engine master
	},
	{
		uuid: CMD_DISPLAY_UUID,
		match: {
			datarefPath: "sim/flightmodel2/engines/N2_percent[0]",
			commandPath: "aerobask/eng/master2_to",
		},
		slugs: single("readouts/eng_ng"), // TODO verify: DA42 right engine master
	},
	// ─── Wind-Display ─────────────────────────────────────────────────────────
	// Only one fingerprint (empty settings), always the wind tile
	{
		uuid: WIND_UUID,
		match: {},
		slugs: single("readouts/wind_dir"),
	},
	// ─── Guarded-Command ──────────────────────────────────────────────────────
	// PA-46 starter — empty settings in fingerprint, the only guarded slot
	{
		uuid: GUARDED_UUID,
		match: {},
		slugs: guardedSlugs("cockpit/starter"),
	},
	// ─── Rotary controls ──────────────────────────────────────────────────────
	// Flaps up/down — nudge-display flaps_up / flaps_down
	{
		uuid: ROTARY_UUID,
		match: {
			datarefPath: "sim/cockpit2/controls/flap_system_deploy_ratio",
			commandPath: "sim/flight_controls/flaps_up",
		},
		slugs: single("cockpit/flaps_up"),
	},
	{
		uuid: ROTARY_UUID,
		match: {
			datarefPath: "sim/cockpit2/controls/flap_system_deploy_ratio",
			commandPath: "sim/flight_controls/flaps_down",
		},
		slugs: single("cockpit/flaps_down"),
	},
	{
		uuid: ROTARY_UUID,
		match: { commandPath: "sim/flight_controls/flaps_down" },
		slugs: single("cockpit/flaps_down"),
	},
	// Magnetos
	{
		uuid: ROTARY_UUID,
		match: {
			datarefPath: "sim/cockpit/engine/ignition_on[0]",
			commandPath: "sim/magnetos/magnetos_up_1",
		},
		slugs: single("cockpit/magneto_cw"),
	},
	{
		uuid: ROTARY_UUID,
		match: { commandPath: "sim/magnetos/magnetos_down_1" },
		slugs: single("cockpit/magneto_ccw"),
	},
	// Fuel selector (DV20) — bare arrows (no label)
	{
		uuid: ROTARY_UUID,
		match: { datarefPath: "aerobask/fuel_selector", commandPath: "sim/fuel/fuel_selector_lft" },
		slugs: single("cockpit/bare_left_green"),
	},
	{
		uuid: ROTARY_UUID,
		match: { datarefPath: "aerobask/fuel_selector", commandPath: "sim/fuel/fuel_selector_rgt" },
		slugs: single("cockpit/bare_right_green"),
	},
	// Aerobask DA42 flaps (rare alternate flaps_up rotary using aerobask/anim/sw_flap)
	{
		uuid: ROTARY_UUID,
		match: {
			datarefPath: "aerobask/anim/sw_flap",
			commandPath: "sim/flight_controls/flaps_up",
		},
		slugs: single("cockpit/flaps_up"),
	},
	// ─── Aircraft-specific toggles (Aerobask Phenom 300, DV20, DA42) ──────────
	// Aerobask Phenom 300 system switches (datarefPath-only fingerprint)
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/bleed/sw_xbleed" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/bleed/sw_bleed1" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/bleed/sw_bleed2" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/hyd/sw_pump1" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/hyd/sw_pump2" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/engines/sw_ignition_1" },
		slugs: toggleSlugs("cockpit/mag1"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/engines/sw_ignition_2" },
		slugs: toggleSlugs("cockpit/mag2"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/electrical/sw_gen1" },
		slugs: toggleSlugs("cockpit/alt_l"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/electrical/sw_gen2" },
		slugs: toggleSlugs("cockpit/alt_r"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/electrical/sw_batt1" },
		slugs: toggleSlugs("cockpit/master_bat"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/electrical/sw_batt2" },
		slugs: toggleSlugs("cockpit/master_bat"),
	},
	// Aerobask DV20 mags + CSC
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/sw_mag1" },
		slugs: toggleSlugs("cockpit/mag1"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/sw_mag2" },
		slugs: toggleSlugs("cockpit/mag2"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "aerobask/csc_as_thr", commandPath: "aerobask/gfc700_csc" },
		slugs: toggleSlugs("autopilot/csc"),
	},
	// ─── Aircraft-specific toggles (PA-46 / MD via thranda + md namespaces) ───
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/pitot_button" },
		slugs: toggleSlugs("cockpit/pitot_heat"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/prop_heat_button" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/avionics_button" },
		slugs: toggleSlugs("cockpit/avionics"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/stall_heat_button" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/reverse_lockout_button" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/buttons/starter_mode_button" },
		slugs: toggleSlugs("cockpit/motor_start"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "md/electrical/battery_master" },
		slugs: toggleSlugs("cockpit/master_bat"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit/pressure/bleed_air_mode" },
		slugs: toggleSlugs("cockpit/nolabel"), // TODO verify: bleed air mode shown via sublabel?
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "sim/cockpit2/switches/generic_lights_switch[10]" },
		slugs: toggleSlugs("cockpit/nolabel"), // TODO verify: generic light index 10
	},
	// ─── Thranda PC12 sound annunciators → alert tiles ────────────────────────
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "thranda/sound/MasterCaution" },
		slugs: toggleSlugs("alerts/caution"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "thranda/sound/MasterWarning" },
		slugs: toggleSlugs("alerts/warning"),
	},
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "thranda/lights/RecogLights" },
		slugs: toggleSlugs("lights/lt_nav"), // TODO verify: recognition lights → nav-like tile
	},
	// ─── Aerobask commands (fuel levers, prime, options/test) ─────────────────
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/eng/fuel_lever1_up" },
		slugs: single("cockpit/bare_up_green"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/eng/fuel_lever1_dn" },
		slugs: single("cockpit/bare_down_green"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/eng/fuel_lever2_up" },
		slugs: single("cockpit/bare_up_green"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/eng/fuel_lever2_dn" },
		slugs: single("cockpit/bare_down_green"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/fuel_prime_toggle" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/show_options" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/test/start" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	// Aerobask "otto" AP mode commands — TODO verify: catalog has no direct match,
	// these likely fire AP TRK/IAS/LVL modes which behave like dataref-toggles.
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/otto/ap_trk" },
		slugs: single("cockpit/nolabel_cmd"), // TODO verify: TRK mode toggle
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/otto/ap_ias" },
		slugs: single("cockpit/nolabel_cmd"), // TODO verify: IAS hold
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "aerobask/otto/ap_level" },
		slugs: single("cockpit/nolabel_cmd"), // TODO verify: level mode
	},
	// ─── PA-46 / MD / misc commands ──────────────────────────────────────────
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "pa46/electrical/emergency_power" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "md/commands/toggle_panel" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "sim/annunciator/test_stall" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "sim/autopilot/wing_leveler" },
		slugs: single("cockpit/nolabel_cmd"), // TODO verify: wing leveler — no single-state CSC icon
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "sim/operation/slider_21" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "sim/engines/engage_starters" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "sim/fuel/fuel_selector_none" },
		slugs: single("cockpit/bare_down_green"),
	},
	// ─── Catch-all for unconfigured slots (no commandPath / dataref set) ──────
	// A command slot with only `hideConfirmation: true` and no commandPath —
	// blank placeholder tile.
	{
		uuid: COMMAND_UUID,
		match: { commandPath: "" },
		slugs: single("cockpit/nolabel_cmd"),
	},
	// An empty dataref-toggle (no datarefPath) — blank placeholder tile.
	{
		uuid: TOGGLE_UUID,
		match: { datarefPath: "" },
		slugs: toggleSlugs("cockpit/nolabel"),
	},
];

export function resolveSlug(
	uuid: string,
	settings: Record<string, unknown>,
): Record<number, string> | undefined {
	// 1) Try patterns
	for (const rule of PATTERNS) {
		if (rule.uuid !== uuid) continue;
		const val = settings[rule.pathField];
		if (typeof val !== "string") continue;
		const m = val.match(rule.pattern);
		if (m) return rule.slugs(m, settings);
	}
	// 2) Try direct lookup. A rule with `match: {}` is a catch-all for its UUID.
	for (const rule of DIRECT) {
		if (rule.uuid !== uuid) continue;
		let ok = true;
		for (const [key, expected] of Object.entries(rule.match)) {
			if (settings[key] !== expected) {
				ok = false;
				break;
			}
		}
		if (ok) return rule.slugs;
	}
	// 3) Last-resort fallback for unconfigured placeholder slots
	// (no commandPath/datarefPath set). These render as blank tiles; the
	// user can set a real path + binding later if they wire up the button.
	if (uuid === COMMAND_UUID && !settings.commandPath) {
		return single("cockpit/nolabel_cmd");
	}
	if (uuid === TOGGLE_UUID && !settings.datarefPath) {
		return toggleSlugs("cockpit/nolabel");
	}
	return undefined;
}

// Heuristic slug guess for --suggest mode: scans out/icons/ for a filename
// whose stem ends with the last segment of commandPath/datarefPath.
// Used only by `update-profile-icons.ts --suggest` to seed unbound entries.
export function suggestSlugFromPath(path: string, availableSlugs: string[]): string | undefined {
	if (!path) return undefined;
	const last = path
		.split("/")
		.pop()
		?.replace(/\[\d+\]$/, "");
	if (!last) return undefined;
	const exact = availableSlugs.find((s) => s.endsWith(`/${last}`) || s.endsWith(`/${last}_off`));
	return exact;
}
