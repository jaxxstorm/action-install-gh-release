# Makefile for building a TypeScript GitHub Action

# Variables
SHELL := /bin/bash
SRC_DIR := src
BUILD_DIR := lib
ENTRY_POINT := $(SRC_DIR)/main.ts

# Binaries
TS_NODE := ./node_modules/.bin/ts-node
TS_C := ./node_modules/.bin/tsc
ESLINT := ./node_modules/.bin/eslint
PRETTIER := ./node_modules/.bin/prettier
NCC := ./node_modules/.bin/ncc

# Targets
.PHONY: all clean install build format prepare typecheck

all: clean install build

# Clean up the dist directory
clean:
	rm -rf $(BUILD_DIR)

# Install npm dependencies
install:
	npm install

dev:
	npm install --save-dev

prepare:
	$(NCC) build $(ENTRY_POINT) -o $(BUILD_DIR)

# Bundle the action into the runtime directory used by action.yml
build: clean
	$(NCC) build $(ENTRY_POINT) -o $(BUILD_DIR)

# Type-check the TypeScript sources without writing output
typecheck:
	$(TS_C) --noEmit

# Lint the TypeScript code
lint:
	$(ESLINT) $(SRC_DIR)

# Format the TypeScript code
format:
	$(PRETTIER) --write "$(SRC_DIR)/**/*.ts"

# Run the action locally (for testing purposes)
run: build
	node $(BUILD_DIR)/index.js

