import streamDeck from "@elgato/streamdeck";

import { CommandPause } from "./actions/command-pause";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new CommandPause());

streamDeck.connect();
