#!/bin/sh
set -eu
exec deno run --quiet --allow-env --allow-read --allow-run "$(dirname "$0")/main.ts"
