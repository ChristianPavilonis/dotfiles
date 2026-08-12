#!/bin/sh
set -eu
exec deno run --quiet --allow-env "$(dirname "$0")/main.ts"
