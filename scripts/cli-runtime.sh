#!/bin/sh
# Runtime compartilhado pelo instalador e pelo comando global. Nunca executa .env.

jubart_runtime_prepare() {
  command -v docker >/dev/null 2>&1 || { echo 'Instale e inicie o Docker antes de usar o Jubart.' >&2; return 1; }
  JUBART_SOURCE=${JUBART_SOURCE:-$JUBART_ROOT}
  JUBART_CLI_IMAGE=${JUBART_CLI_IMAGE:-$(cat "$JUBART_SOURCE/config/cli-image")}
  case "$JUBART_CLI_IMAGE" in ''|-*|*[!a-zA-Z0-9._/:@-]*) echo 'Imagem da CLI inválida.' >&2; return 1 ;; esac
  if [ -n "${DOCKER_CONTEXT:-}" ]; then
    JUBART_ENDPOINT=$(docker context inspect --format '{{.Endpoints.docker.Host}}') || return 1
  else
    JUBART_ENDPOINT=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')} || return 1
  fi
  case "$JUBART_ENDPOINT" in unix://*) JUBART_SOCKET=${JUBART_ENDPOINT#unix://} ;; *) echo 'A CLI requer Docker local por socket Unix, no mesmo host dos projetos.' >&2; return 1 ;; esac
  [ -S "$JUBART_SOCKET" ] || { echo 'Socket Docker local indisponível.' >&2; return 1; }
  docker info >/dev/null 2>&1 || { echo 'Docker indisponível ou sem permissão para o usuário atual.' >&2; return 1; }
  if ! docker image inspect "$JUBART_CLI_IMAGE" >/dev/null 2>&1; then
    echo 'Preparando a imagem da CLI Jubart…' >&2
    if ! docker pull "$JUBART_CLI_IMAGE"; then
      if [ "$JUBART_CLI_IMAGE" != "$(cat "$JUBART_SOURCE/config/cli-image")" ]; then
        echo 'Não foi possível obter a imagem personalizada da CLI. Confira o nome, acesso ao registro e versão.' >&2
        return 1
      fi
      echo 'Imagem não obtida; construindo o runtime a partir deste checkout…' >&2
      sh "$JUBART_SOURCE/scripts/build-cli.sh" "$JUBART_CLI_IMAGE" || return 1
    fi
  fi
}

jubart_runtime_cleanup() {
  [ -z "${JUBART_CLIENT_PID:-}" ] || kill -CONT "$JUBART_CLIENT_PID" 2>/dev/null || :
  [ -z "${JUBART_CLIENT_PID:-}" ] || kill -TERM "$JUBART_CLIENT_PID" 2>/dev/null || :
  [ -z "${JUBART_RUNTIME_NAME:-}" ] || docker rm -f "$JUBART_RUNTIME_NAME" >/dev/null 2>&1 || :
  [ -z "${JUBART_STTY:-}" ] || stty "$JUBART_STTY" 2>/dev/null || :
  [ -z "${JUBART_CONTROL:-}" ] || rm -rf -- "$JUBART_CONTROL"
}

jubart_runtime() (
  set -eu
  jubart_runtime_prepare || exit 1
  set -- "$JUBART_CLI_IMAGE" "$@"
  JUBART_CONTROL=$(mktemp -d "${TMPDIR:-/tmp}/jubart-control.XXXXXXXX")
  JUBART_RUNTIME_NAME="jubart-cli-$(id -u)-${JUBART_CONTROL##*.}"
  JUBART_CLIENT_PID=
  JUBART_STTY=
  trap jubart_runtime_cleanup EXIT
  trap ':' INT
  trap 'exit 143' TERM HUP
  chmod 700 "$JUBART_CONTROL"
  mkdir "$JUBART_CONTROL/docker"
  if [ -f "${DOCKER_CONFIG:-$HOME/.docker}/config.json" ]; then
    cp "${DOCKER_CONFIG:-$HOME/.docker}/config.json" "$JUBART_CONTROL/docker/config.json"
    chmod 600 "$JUBART_CONTROL/docker/config.json"
  fi
  mkfifo "$JUBART_CONTROL/request"
  # O descritor RDWR mantém o canal de controle vivo até a notificação de saída.
  exec 3<>"$JUBART_CONTROL/request"
  exec 4<&0 5>&1 6>&2
  if [ -t 0 ] && [ -t 1 ]; then
    JUBART_STTY=$(stty -g)
    set -- --tty "$@"
  fi
  # Somente metadados não secretos do host; NTP não é consultado no container.
  if command -v timedatectl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
    timeout 5 timedatectl show --property=Timezone --property=NTPSynchronized --property=NTP --property=LocalRTC > "$JUBART_CONTROL/time" 2>/dev/null || :
  fi
  # Mesmo UID/GID e grupos do usuário, sem privilégios adicionais.
  set -- --rm --init --name "$JUBART_RUNTIME_NAME" --interactive --network host \
    --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=bind,src=$JUBART_SOCKET,dst=/var/run/docker.sock" \
    --mount type=bind,src=/proc,dst=/run/jubart-host/proc,readonly \
    --tmpfs /run/jubart-tmp:mode=1777 --env TMPDIR=/run/jubart-tmp \
    --env DOCKER_HOST=unix:///var/run/docker.sock --env DOCKER_CONFIG=/run/jubart-control/docker \
    --env "JUBART_ROOT=$JUBART_ROOT" --env JUBART_CONTAINER=1 \
    --env JUBART_CONTROL=/run/jubart-control --env TERM --env NO_COLOR --env CI \
    --env JUBART_NO_ANIMATION --env COLUMNS --env LINES \
    --env COMPOSE_FILE --env COMPOSE_PROFILES --env COMPOSE_PROJECT_NAME --env COMPOSE_ENV_FILES "$@"
  for JUBART_GROUP in $(id -G); do set -- --group-add "$JUBART_GROUP" "$@"; done
  JUBART_SOCKET_GROUP=$(stat -c %g "$JUBART_SOCKET")
  set -- --group-add "$JUBART_SOCKET_GROUP" "$@"
  # Projetos externos ficam visíveis para validação/env_file, com acesso somente
  # leitura. O único workspace gravável é montado explicitamente abaixo.
  for JUBART_PATH in /*; do
    [ -d "$JUBART_PATH" ] && [ ! -L "$JUBART_PATH" ] || continue
    case "$JUBART_PATH" in /bin|/boot|/dev|/etc|/lib|/lib32|/lib64|/libx32|/proc|/run|/sbin|/sys|/usr) continue ;; esac
    set -- --mount "type=bind,src=$JUBART_PATH,dst=$JUBART_PATH,readonly" "$@"
  done
  for JUBART_PATH in /etc/localtime /etc/timezone /etc/passwd /etc/group; do
    [ ! -f "$JUBART_PATH" ] || set -- --mount "type=bind,src=$JUBART_PATH,dst=$JUBART_PATH,readonly" "$@"
  done
  if [ -s /etc/ssl/certs/ca-certificates.crt ]; then
    set -- --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/etc/ssl/certs/ca-certificates.crt,readonly "$@"
  fi
  if [ -d /etc/docker/certs.d ]; then
    set -- --mount type=bind,src=/etc/docker/certs.d,dst=/etc/docker/certs.d,readonly "$@"
  fi
  set -- --mount "type=bind,src=$JUBART_ROOT,dst=$JUBART_ROOT" \
    --mount "type=bind,src=$JUBART_CONTROL,dst=/run/jubart-control" \
    --workdir "$JUBART_ROOT" "$@"
  (
    set +e
    docker run "$@" <&4 >&5 2>&6 &
    JUBART_DOCKER_PID=$!
    printf '%s\n' "$JUBART_DOCKER_PID" > "$JUBART_CONTROL/client-pid"
    wait "$JUBART_DOCKER_PID"
    JUBART_EXIT=$?
    while kill -0 "$JUBART_DOCKER_PID" 2>/dev/null; do
      wait "$JUBART_DOCKER_PID"
      JUBART_EXIT=$?
    done
    printf 'exit\n%s\n' "$JUBART_EXIT" >&3
  ) &
  while :; do
    IFS= read -r JUBART_ACTION <&3 || continue
    IFS= read -r JUBART_VALUE <&3 || continue
    case "$JUBART_ACTION" in
      exit) JUBART_CLIENT_PID=; exit "$JUBART_VALUE" ;;
      dir)
        JUBART_CLIENT_PID=$(cat "$JUBART_CONTROL/client-pid")
        kill -STOP "$JUBART_CLIENT_PID" 2>/dev/null || break
        JUBART_RAW=$(stty -g)
        stty "$JUBART_STTY"
        JUBART_SHELL_EXIT=1
        if [ -d "$JUBART_VALUE" ] && command -v bash >/dev/null 2>&1; then
          (cd -- "$JUBART_VALUE" && bash -i </dev/tty >/dev/tty 2>&1) && JUBART_SHELL_EXIT=0 || JUBART_SHELL_EXIT=$?
        else
          echo 'Pasta da aplicação ou Bash indisponível no host.' >&2
        fi
        stty "$JUBART_RAW"
        kill -CONT "$JUBART_CLIENT_PID" 2>/dev/null || :
        printf '%s\n' "$JUBART_SHELL_EXIT" > "$JUBART_CONTROL/response.tmp"
        mv -f -- "$JUBART_CONTROL/response.tmp" "$JUBART_CONTROL/response"
        ;;
      *) echo 'Solicitação inválida da CLI.' >&2; exit 1 ;;
    esac
  done
  exit 1
)
