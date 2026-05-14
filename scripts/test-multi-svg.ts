import { renderMultiDisplaySvg } from "../src/util/multi-display-svg";

const svg = renderMultiDisplaySvg({
	title: "COM1",
	slots: [
		{ label: "A:", value: "118.500" },
		{ label: "S:", value: "121.500" },
	],
});
console.log("=== SVG ===");
console.log(svg);
console.log("=== With empty slots (only path filter triggered) ===");
const svg2 = renderMultiDisplaySvg({ title: "", slots: [] });
console.log(svg2);
