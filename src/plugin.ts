import streamDeck from "@elgato/streamdeck";

import { CommandPause } from "./actions/command-pause";
import { XPlaneClient } from "./xplane";

streamDeck.logger.setLevel("info");

const xplane = new XPlaneClient({ logger: streamDeck.logger });

xplane.on("connected", () => streamDeck.logger.info("X-Plane: connected"));
xplane.on("disconnected", () => streamDeck.logger.info("X-Plane: disconnected"));
xplane.on("error", (err) => streamDeck.logger.warn("X-Plane: error", err));

streamDeck.actions.registerAction(new CommandPause(xplane));

xplane.connect();
streamDeck.connect();
