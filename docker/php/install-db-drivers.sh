#!/bin/sh
set -eu

for flag in PHP_INSTALL_SQLSERVER PHP_INSTALL_POSTGRESQL PHP_INSTALL_SQLITE PHP_INSTALL_MYSQLI; do
    value=$(printenv "$flag")
    case "$value" in
        true|false) ;;
        *) echo "$flag deve ser true ou false" >&2; exit 1 ;;
    esac
done

set --
if [ "$PHP_INSTALL_SQLSERVER" = true ]; then
    echo "SQL Server via ODBC Microsoft está bloqueado pela política de dependências open source." >&2
    exit 1
fi
if [ "$PHP_INSTALL_POSTGRESQL" = true ]; then
    set -- "$@" pgsql pdo_pgsql
fi
if [ "$PHP_INSTALL_SQLITE" = true ]; then
    set -- "$@" sqlite3 pdo_sqlite
fi
if [ "$PHP_INSTALL_MYSQLI" = true ]; then
    set -- "$@" mysqli
fi
if [ "$#" -gt 0 ]; then
    install-php-extensions "$@"
fi
