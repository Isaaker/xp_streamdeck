import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { toFiniteNumber } from "../util/coerce";
import { parseDataRefPath } from "../util/dataref-path";
import { combineTitle } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import { normalizeFormat, trimString } from "../util/settings";
import type { XPlaneClient } from "../xplane";
import { SubscribableAction, type SubscribableState } from "./base/subscribable-action";

type DataRefWriteSettings = JsonObject & {
	datarefPath?: string;
	value?: string | number;
	label?: string;
	hideConfirmation?: boolean;
	showCurrentValue?: boolean;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
};

interface ActionState extends SubscribableState<DataRefWriteSettings> {
	format: string;
	unitScale?: number;
	precision?: number;
}

@action({ UUID: "com.robertw.xplane.dataref-write" })
export class XPlaneDataRefWrite extends SubscribableAction<DataRefWriteSettings, ActionState> {
	constructor(xplane: XPlaneClient) {
		super(xplane, "dataref-write");
	}

	protected override createState(ev: WillAppearEvent<DataRefWriteSettings>): ActionState {
		const parsed = parseSettings(ev.payload.settings ?? {});
		return {
			action: ev.action,
			path: parsed.path,
			label: parsed.label,
			format: parsed.format,
			unitScale: parsed.unitScale,
			precision: parsed.precision,
		};
	}

	protected override updateStateFromSettings(
		state: ActionState,
		ev: DidReceiveSettingsEvent<DataRefWriteSettings>,
	): { pathChanged: boolean } {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;
		state.path = parsed.path;
		state.label = parsed.label;
		state.format = parsed.format;
		state.unitScale = parsed.unitScale;
		state.precision = parsed.precision;
		return { pathChanged };
	}

	protected override render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const valueText = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
		});
		state.action
			.setTitle(combineTitle(state.label, valueText))
			.catch((err) => streamDeck.logger.warn("dataref-write: setTitle failed", err));
	}

	override async onKeyDown(ev: KeyDownEvent<DataRefWriteSettings>): Promise<void> {
		const settings = ev.payload.settings ?? {};
		const path = trimString(settings.datarefPath);
		const value = toFiniteNumber(settings.value);
		const hideConfirmation = settings.hideConfirmation === true;

		if (!path) {
			streamDeck.logger.warn("dataref-write: datarefPath is empty");
			await ev.action.showAlert();
			return;
		}
		if (value === undefined) {
			streamDeck.logger.warn(`dataref-write: value is empty/invalid for ${path}`);
			await ev.action.showAlert();
			return;
		}

		try {
			const { basePath, index } = parseDataRefPath(path);
			const id = await this.xplane.getDataRefId(basePath);
			await this.xplane.writeDataRef(id, value, index);
			streamDeck.logger.info(`dataref-write: ${path} = ${value} (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`dataref-write failed: ${path} = ${value}`, err);
			await ev.action.showAlert();
		}
	}
}

// `path` is the *subscription* path: empty when showCurrentValue=false so the
// SubscribableAction base treats this action as "no subscription, just show
// the label". The real datarefPath is still read directly in onKeyDown for
// the write operation.
function parseSettings(s: DataRefWriteSettings): {
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
} {
	const showCurrentValue = s.showCurrentValue === true;
	return {
		path: showCurrentValue ? trimString(s.datarefPath) : "",
		label: trimString(s.label),
		format: normalizeFormat(s.format),
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
	};
}
