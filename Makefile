.PHONY: help validate register test clean

SHELL := /bin/bash

# Configuration
PROVIDER_CONFIG := config/provider.yml
CI_CONFIG := config/ci.yml
SCRIPTS_DIR := scripts

help: ## Show available commands
	@echo ""
	@echo "Codesphere Landscape Provider — Available Commands"
	@echo "=================================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

validate: ## Validate provider.yml and ci.yml
	@bash $(SCRIPTS_DIR)/validate.sh

register: validate ## Register the provider with Codesphere (validates first)
	@bash $(SCRIPTS_DIR)/register.sh

test: validate ## Deploy a test instance and run smoke tests
	@bash $(SCRIPTS_DIR)/test-provider.sh

clean: ## Remove generated config files (keeps examples)
	@echo "Cleaning generated configs..."
	@rm -f $(PROVIDER_CONFIG) $(CI_CONFIG)
	@echo "Done."
