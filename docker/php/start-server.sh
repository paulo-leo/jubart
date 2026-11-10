#!/bin/sh
set -eu

case "${PHP_SERVER_MODE:-traditional}" in
    traditional)
        exec frankenphp run --config /etc/frankenphp/Caddyfile --adapter caddyfile
        ;;
    octane)
        if [ ! -f artisan ] || [ ! -f vendor/laravel/octane/composer.json ]; then
            echo "Modo octane exige Laravel e laravel/octane instalado. Instale e configure o pacote na aplicação ou use PHP_SERVER_MODE=traditional." >&2
            exit 1
        fi
        exec php artisan octane:frankenphp \
            --host=0.0.0.0 --port="${PHP_HTTP_PORT:-8000}" --admin-port=2019 \
            --workers="${OCTANE_WORKERS:-2}" \
            --max-requests="${OCTANE_MAX_REQUESTS:-500}"
        ;;
    *)
        echo "PHP_SERVER_MODE inválido: use traditional ou octane." >&2
        exit 1
        ;;
esac
