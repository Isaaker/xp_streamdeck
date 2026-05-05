type IconBase = {
	name: string;
	label: string;
	accent: string;
	group?: string;
};

export type ToggleIcon = IconBase & { kind: "toggle" };
export type DisplayIcon = IconBase & { kind: "display" };
export type IconDef = ToggleIcon | DisplayIcon;

export const catalog: IconDef[] = [
	// === Autopilot mode toggles — pressed to engage/disengage ===
	{ kind: "toggle", name: "ap", label: "AP", accent: "#22c55e", group: "AP" },
	{ kind: "toggle", name: "fd", label: "FD", accent: "#22c55e", group: "AP" },
	{ kind: "toggle", name: "yaw", label: "YD", accent: "#22c55e", group: "AP" },
	{ kind: "toggle", name: "hdg", label: "HDG", accent: "#3b82f6", group: "AP" },
	{ kind: "toggle", name: "nav", label: "NAV", accent: "#3b82f6", group: "AP" },
	{ kind: "toggle", name: "up", label: "UP", accent: "#3b82f6", group: "AP" },
	{ kind: "toggle", name: "dwn", label: "DWN", accent: "#3b82f6", group: "AP" },
	{ kind: "toggle", name: "alt", label: "ALT", accent: "#a855f7", group: "AP" },
	{ kind: "toggle", name: "vs", label: "V/S", accent: "#a855f7", group: "AP" },
	{ kind: "toggle", name: "flc", label: "FLC", accent: "#a855f7", group: "AP" },
	{ kind: "toggle", name: "vnav", label: "VNAV", accent: "#a855f7", group: "AP" },
	{ kind: "toggle", name: "apr", label: "APR", accent: "#f59e0b", group: "AP" },
	{ kind: "toggle", name: "bc", label: "BC", accent: "#f59e0b", group: "AP" },

	// === Live readouts (display-only, no on/off) ===
	// Layout reserves the lower 2/3 of the key for the Stream Deck title overlay.
	{ kind: "display", name: "cur_hdg", label: "HDG", accent: "#3b82f6", group: "INST" },
	{ kind: "display", name: "cur_alt", label: "ALT", accent: "#a855f7", group: "INST" },
	{ kind: "display", name: "cur_ias", label: "IAS", accent: "#38bdf8", group: "INST" },
	{ kind: "display", name: "cur_vs", label: "V/S", accent: "#a855f7", group: "INST" },
	{ kind: "display", name: "cur_baro", label: "BARO", accent: "#94a3b8", group: "INST" },
	{ kind: "display", name: "wind_dir", label: "WIND", accent: "#94a3b8", group: "INST" },
	{ kind: "display", name: "wind_spd", label: "W SPD", accent: "#94a3b8", group: "INST" },

	// === Autopilot setpoint readouts (what the AP is set to right now) ===
	{ kind: "display", name: "ap_hdg", label: "AP HDG", accent: "#3b82f6", group: "AP-SET" },
	{ kind: "display", name: "ap_alt", label: "AP ALT", accent: "#a855f7", group: "AP-SET" },
	{ kind: "display", name: "ap_vs", label: "AP V/S", accent: "#a855f7", group: "AP-SET" },
	{ kind: "display", name: "ap_src", label: "AP SRC", accent: "#22c55e", group: "AP-SET" },
];
