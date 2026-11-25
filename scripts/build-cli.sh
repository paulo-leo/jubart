#!/bin/sh
# Contexto explícito: não percorre nem envia .env, projetos ou estado privado.
set -eu
JUBART_BUILD_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
JUBART_BUILD_TAG=${1:-$(cat "$JUBART_BUILD_ROOT/config/cli-image")}
JUBART_BUILD_CONTEXT=$(mktemp "${TMPDIR:-/tmp}/jubart-cli-context.XXXXXXXX.tar")
trap 'rm -f -- "$JUBART_BUILD_CONTEXT"' EXIT HUP INT TERM
cd "$JUBART_BUILD_ROOT"
tar -cf "$JUBART_BUILD_CONTEXT" docker/cli/Dockerfile docker/panel/package.json docker/panel/package-lock.json \
  docker/panel/*.mjs docker/panel/public/http-methods.js docker/panel/public/password-policy.js \
  scripts/jubart*.py scripts/install-wizard.py scripts/cli-logo.json
docker build --load --file docker/cli/Dockerfile --tag "$JUBART_BUILD_TAG" - < "$JUBART_BUILD_CONTEXT"
