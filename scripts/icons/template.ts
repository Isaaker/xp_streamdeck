import type { IconDef } from "./catalog.ts";

export type IconState = "on" | "off";

const SIZE = 144;
const BG = "#0d0d0d";
const LABEL_COLOR = "#ffffff";
const BAR_OFF = "#1f1f1f";

const BAR_HEIGHT = 14;
const BAR_INSET_X = 14;
const BAR_INSET_BOTTOM = 14;
const BAR_RADIUS = 3;

const LABEL_FONT_SIZE = 44;
const LABEL_BASELINE_Y = 82;

const FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

export function renderIcon(def: IconDef, state: IconState): string {
	const barFill = state === "on" ? def.accent : BAR_OFF;
	const barWidth = SIZE - BAR_INSET_X * 2;
	const barY = SIZE - BAR_INSET_BOTTOM - BAR_HEIGHT;

	const glow =
		state === "on"
			? `<rect x="${BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${BAR_HEIGHT}" rx="${BAR_RADIUS}" fill="${def.accent}" filter="url(#glow)" opacity="0.55"/>`
			: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${LABEL_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${LABEL_FONT_SIZE}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${def.label}</text>
  ${glow}
  <rect x="${BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${BAR_HEIGHT}" rx="${BAR_RADIUS}" fill="${barFill}"/>
</svg>`;
}
