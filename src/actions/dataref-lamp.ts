/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { TOLERANCE_FLOAT } from "../const";
import { coerceNumber, toFiniteNumber } from "../util/coerce";
import { type LampColor, type LampLabelPosition, renderLampDataUrl } from "../util/lamp-svg";
import { trimString } from "../util/settings";
import type { XPlaneClient } from "../xplane";
import { SubscribableAction, type SubscribableState } from "./base/subscribable-action";

type DataRefLampSettings = JsonObject & {
	datarefPath?: string;
	valueOn?: string | number;
	valueOff?: string | number;
	color?: LampColor;
	label?: string;
	labelPosition?: LampLabelPosition;
};

interface ActionState extends SubscribableState<DataRefLampSettings> {
	valueOn: number;
	valueOff: number;
	color: LampColor;
	labelPosition: LampLabelPosition;
	lastLit?: boolean;
}

@action({ UUID: "com.robertw.xplane.dataref-lamp" })
export class XPlaneDataRefLamp extends SubscribableAction<DataRefLampSettings, ActionState> {
	constructor(xplane: XPlaneClient) {
		super(xplane, "dataref-lamp");
	}

	protected override createState(ev: WillAppearEvent<DataRefLampSettings>): ActionState {
		const parsed = parseSettings(ev.payload.settings ?? {});
		return {
			action: ev.action,
			path: parsed.path,
			label: parsed.label,
			valueOn: parsed.valueOn,
			valueOff: parsed.valueOff,
			color: parsed.color,
			labelPosition: parsed.labelPosition,
		};
	}

	protected override updateStateFromSettings(
		state: ActionState,
		ev: DidReceiveSettingsEvent<DataRefLampSettings>,
	): { pathChanged: boolean } {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;
		state.path = parsed.path;
		state.label = parsed.label;
		state.valueOn = parsed.valueOn;
		state.valueOff = parsed.valueOff;
		state.color = parsed.color;
		state.labelPosition = parsed.labelPosition;
		// Force a re-render on the next render() call even if the lit state
		// hasn't changed — color / label / labelPosition may have.
		state.lastLit = undefined;
		return { pathChanged };
	}

	protected override render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const num = coerceNumber(state.lastValue);
		const isLit = num !== undefined && Math.abs(num - state.valueOn) < TOLERANCE_FLOAT;
		if (state.lastLit === isLit) return;
		state.lastLit = isLit;
		state.action
			.setImage(
				renderLampDataUrl({
					color: state.color,
					isLit,
					label: state.label || undefined,
					labelPosition: state.labelPosition,
				}),
			)
			.catch((err) => streamDeck.logger.warn("dataref-lamp: setImage failed", err));
	}
}

function parseSettings(s: DataRefLampSettings): {
	path: string;
	label: string;
	valueOn: number;
	valueOff: number;
	color: LampColor;
	labelPosition: LampLabelPosition;
} {
	const color: LampColor =
		s.color === "blue" ||
		s.color === "yellow" ||
		s.color === "orange" ||
		s.color === "red" ||
		s.color === "green"
			? s.color
			: "green";
	const labelPosition: LampLabelPosition = s.labelPosition === "bottom" ? "bottom" : "top";
	return {
		path: trimString(s.datarefPath),
		label: trimString(s.label),
		valueOn: toFiniteNumber(s.valueOn) ?? 1,
		valueOff: toFiniteNumber(s.valueOff) ?? 0,
		color,
		labelPosition,
	};
}
