ARG PHP_VERSION=8.4.27
ARG FRANKENPHP_VERSION=1
ARG FRANKENPHP_DIGEST=sha256:30061df7626971d597e45962269dfa7c077d972e96d1c4baf7c9259d5f7ecd55
ARG COMPOSER_IMAGE=composer:2@sha256:8de2184c6de224f4689e8f80ed5f5edaf0030b6b8b7839a22a2bcb6722ac87d0
FROM ${COMPOSER_IMAGE} AS composer_binary
FROM dunglas/frankenphp:${FRANKENPHP_VERSION}-php${PHP_VERSION}-bookworm@${FRANKENPHP_DIGEST}

COPY extensions.list /tmp/php-extensions.list
RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip \
    && extensions="$(cat /tmp/php-extensions.list)" \
    && for extension in $extensions; do case "$extension" in sqlsrv*|pdo_sqlsrv*) echo "Drivers ODBC Microsoft bloqueados pela política open source" >&2; exit 1;; esac; done \
    && if [ -n "$(printf '%s' "$extensions" | tr -d '[:space:]')" ]; then install-php-extensions $extensions; fi \
    && rm -rf /var/lib/apt/lists/*

ARG PHP_INSTALL_SQLSERVER=false
ARG PHP_INSTALL_POSTGRESQL=false
ARG PHP_INSTALL_SQLITE=false
ARG PHP_INSTALL_MYSQLI=false
COPY install-db-drivers.sh /tmp/install-db-drivers.sh
RUN sh /tmp/install-db-drivers.sh

COPY --from=composer_binary /usr/bin/composer /usr/local/bin/composer
COPY start-server.sh /usr/local/bin/start-server.sh
WORKDIR /var/www/html
