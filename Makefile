.DEFAULT_GOAL := help
SHELL := /bin/bash

PLUGIN_UUID  := com.robertw.xplane
SDPLUGIN_DIR := $(PLUGIN_UUID).sdPlugin
MAIN_BRANCH  := main

.PHONY: help build clean test package cleanup_tags cleanup_branches cleanup_actions

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "; printf "Available targets:\n"} \
		/^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Compile TypeScript via rollup into <plugin>/bin/plugin.js
	npm run build

clean: ## Remove build output, logs and node_modules
	rm -rf $(SDPLUGIN_DIR)/bin $(SDPLUGIN_DIR)/logs node_modules

test: ## Type-check the source (no test framework configured yet)
	npx tsc --noEmit

package: build ## Build a distributable .streamDeckPlugin (uses streamdeck pack — see M08)
	streamdeck pack $(SDPLUGIN_DIR)

cleanup_tags: ## Remove local tags that no longer exist on origin
	git fetch --prune --prune-tags origin

cleanup_branches: ## Delete local branches already merged into main
	git fetch --prune origin
	@git branch --merged $(MAIN_BRANCH) --format='%(refname:short)' \
		| grep -vE '^($(MAIN_BRANCH))$$' \
		| xargs -r -n1 git branch -d

cleanup_actions: ## Delete all GitHub Actions workflow runs (requires gh CLI)
	@command -v gh >/dev/null 2>&1 || { echo "gh CLI not installed (brew install gh)"; exit 1; }
	@read -p "Delete ALL GitHub Actions runs for this repo? [y/N] " ans; \
		[ "$$ans" = "y" ] || { echo "aborted"; exit 0; }
	@gh run list --limit 200 --json databaseId --jq '.[].databaseId' \
		| xargs -r -I{} gh run delete {}
