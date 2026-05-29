import streamDeck from "@elgato/streamdeck";

import { XPlaneBackground } from "./actions/background";
import { XPlaneCommand } from "./actions/command";
import { XPlaneCommandDisplay } from "./actions/command-display";
import { XPlaneDataRefDisplay } from "./actions/dataref-display";
import { XPlaneDataRefToggle } from "./actions/dataref-toggle";
import { XPlaneDataRefWrite } from "./actions/dataref-write";
import { XPlaneGuardedCommand } from "./actions/guarded-command";
import { XPlaneGuardedDataRef } from "./actions/guarded-dataref";
import { XPlaneMultiDataRefDisplay } from "./actions/multi-dataref-display";
import { XPlaneRotary } from "./actions/rotary";
import { XPlaneWindDisplay } from "./actions/wind-display";
import { XPlaneClient } from "./xplane";

streamDeck.logger.setLevel("info");

const xplane = new XPlaneClient({ logger: streamDeck.logger });

xplane.on("connected", () => streamDeck.logger.info("X-Plane: connected"));
xplane.on("disconnected", () => streamDeck.logger.info("X-Plane: disconnected"));
xplane.on("error", (err) => streamDeck.logger.warn("X-Plane: error", err));

streamDeck.actions.registerAction(new XPlaneCommand(xplane));
streamDeck.actions.registerAction(new XPlaneCommandDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneGuardedCommand(xplane));
streamDeck.actions.registerAction(new XPlaneGuardedDataRef(xplane));
streamDeck.actions.registerAction(new XPlaneRotary(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneMultiDataRefDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefWrite(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefToggle(xplane));
streamDeck.actions.registerAction(new XPlaneWindDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneBackground());

xplane.connect();
streamDeck.connect().catch((err) => streamDeck.logger.error("streamDeck.connect failed", err));
