import type { DisplayIcon, ToggleIcon } from "./catalog.ts";

export type IconState = "on" | "off";

const SIZE = 144;
const BG = "#0d0d0d";
const LABEL_COLOR = "#ffffff";
const BAR_OFF = "#1f1f1f";

const FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";

// === Toggle (on/off button) layout ===
// Labels up to 4 chars (the AP family — VNAV is the design max) render at 44px.
// Longer labels (lights, controls) shrink in a fixed staircase so they stay
// inside the canvas without per-icon hand-tuning. Labels of the same length
// always render at the same size → groups look uniform within themselves.
const TOGGLE_BAR_HEIGHT = 14;
const TOGGLE_BAR_INSET_X = 14;
const TOGGLE_BAR_INSET_BOTTOM = 14;
const TOGGLE_BAR_RADIUS = 3;

const TOGGLE_LABEL_VISUAL_CENTER_Y = 64;

function toggleFontSize(label: string): number {
	const len = label.length;
	if (len <= 4) return 44;
	if (len === 5) return 36;
	if (len === 6) return 30;
	if (len === 7) return 26;
	if (len === 8) return 22;
	if (len === 9) return 20;
	return 18;
}

function toggleBaselineY(fontSize: number): number {
	return Math.round(TOGGLE_LABEL_VISUAL_CENTER_Y + fontSize * 0.35);
}

// === Display (live readout) layout ===
// Caption + accent line live in the top ~⅓ so Stream Deck's title overlay
// (live DataRef value) gets the lower ~⅔ of the key.
const DISPLAY_LABEL_FONT_SIZE = 22;
const DISPLAY_LABEL_BASELINE_Y = 30;
const DISPLAY_ACCENT_LINE_Y = 40;
const DISPLAY_ACCENT_LINE_HEIGHT = 2;
const DISPLAY_ACCENT_LINE_WIDTH = 64;

export function renderToggleIcon(def: ToggleIcon, state: IconState): string {
	const fontSize = toggleFontSize(def.label);
	const baselineY = toggleBaselineY(fontSize);
	const barFill = state === "on" ? def.accent : BAR_OFF;
	const barWidth = SIZE - TOGGLE_BAR_INSET_X * 2;
	const barY = SIZE - TOGGLE_BAR_INSET_BOTTOM - TOGGLE_BAR_HEIGHT;

	const glow =
		state === "on"
			? `<rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${def.accent}" filter="url(#glow)" opacity="0.55"/>`
			: "";

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${baselineY}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="800"
        fill="${LABEL_COLOR}" letter-spacing="1">${def.label}</text>
  ${glow}
  <rect x="${TOGGLE_BAR_INSET_X}" y="${barY}" width="${barWidth}" height="${TOGGLE_BAR_HEIGHT}" rx="${TOGGLE_BAR_RADIUS}" fill="${barFill}"/>
</svg>`;
}

export function renderDisplayIcon(def: DisplayIcon): string {
	const lineX = (SIZE - DISPLAY_ACCENT_LINE_WIDTH) / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <text x="${SIZE / 2}" y="${DISPLAY_LABEL_BASELINE_Y}" text-anchor="middle"
        font-family="${FONT_STACK}" font-size="${DISPLAY_LABEL_FONT_SIZE}" font-weight="700"
        fill="${LABEL_COLOR}" letter-spacing="1">${def.label}</text>
  <rect x="${lineX}" y="${DISPLAY_ACCENT_LINE_Y}" width="${DISPLAY_ACCENT_LINE_WIDTH}" height="${DISPLAY_ACCENT_LINE_HEIGHT}" fill="${def.accent}"/>
</svg>`;
}
