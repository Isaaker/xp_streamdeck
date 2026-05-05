export type IconDef = {
	name: string;
	label: string;
	accent: string;
	group?: string;
};

export const catalog: IconDef[] = [
	{ name: "ap", label: "AP", accent: "#22c55e", group: "AP" },
	{ name: "fd", label: "FD", accent: "#22c55e", group: "AP" },
	{ name: "yaw", label: "YD", accent: "#22c55e", group: "AP" },
	{ name: "hdg", label: "HDG", accent: "#3b82f6", group: "AP" },
	{ name: "nav", label: "NAV", accent: "#3b82f6", group: "AP" },
	{ name: "up", label: "UP", accent: "#3b82f6", group: "AP" },
	{ name: "dwn", label: "DWN", accent: "#3b82f6", group: "AP" },
	{ name: "alt", label: "ALT", accent: "#a855f7", group: "AP" },
	{ name: "vs", label: "V/S", accent: "#a855f7", group: "AP" },
	{ name: "flc", label: "FLC", accent: "#a855f7", group: "AP" },
	{ name: "vnav", label: "VNAV", accent: "#a855f7", group: "AP" },
	{ name: "apr", label: "APR", accent: "#f59e0b", group: "AP" },
	{ name: "bc", label: "BC", accent: "#f59e0b", group: "AP" },
];
