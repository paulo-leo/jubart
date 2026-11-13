#!/bin/sh
# Run as the owner of the checkout. sudo is used only for the command symlink.
set -eu
JUBART_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
JUBART_BIN=/usr/local/bin
JUBART_START=true
JUBART_INTERACTIVE=true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --bin-dir) [ "$#" -ge 2 ] || { echo 'Informe o diretório de comandos.' >&2; exit 1; }; JUBART_BIN=$2; shift 2 ;;
    --no-start) JUBART_START=false; shift ;;
    --non-interactive) JUBART_INTERACTIVE=false; shift ;;
    --help) echo 'Uso: ./install.sh [--bin-dir DIRETORIO] [--no-start] [--non-interactive]'; echo 'Pergunta os dados iniciais, prepara .env, instala jubart e inicia somente o painel.'; echo '--non-interactive preserva valores existentes e gera credenciais quando necessário.'; exit 0 ;;
    *) echo 'Opção desconhecida. Use ./install.sh --help.' >&2; exit 1 ;;
  esac
done
cd "$JUBART_ROOT"
for JUBART_TOOL in docker python3 readlink ip stat; do
  command -v "$JUBART_TOOL" >/dev/null 2>&1 || { echo "Instale $JUBART_TOOL antes de continuar." >&2; exit 1; }
done
python3 -c 'import ssl, zoneinfo; zoneinfo.ZoneInfo("UTC"); assert ssl.create_default_context().get_ca_certs(), "Instale ca-certificates no host."' || { echo 'Python 3.9+ com SSL, dados de fuso horário (tzdata) e ca-certificates são necessários. Consulte o README.' >&2; exit 1; }
docker compose version >/dev/null
docker buildx version >/dev/null || { echo 'Instale o plugin Docker Buildx. Consulte o README.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker indisponível. Inicie o daemon e conceda acesso ao seu usuário.' >&2; exit 1; }
case "$JUBART_BIN" in /*) ;; *) echo '--bin-dir precisa ser um caminho absoluto.' >&2; exit 1 ;; esac
JUBART_LINK=$JUBART_BIN/jubart
if [ -e "$JUBART_LINK" ] || [ -L "$JUBART_LINK" ]; then
  [ "$(readlink -f -- "$JUBART_LINK")" = "$JUBART_ROOT/jubart" ] || { echo 'Já existe outro comando jubart nesse destino. Escolha outro --bin-dir.' >&2; exit 1; }
fi
if [ ! -d "$JUBART_BIN" ] || [ ! -w "$JUBART_BIN" ]; then
  command -v sudo >/dev/null 2>&1 || { echo 'Sem permissão para instalar o comando. Use --bin-dir com um diretório gravável do PATH.' >&2; exit 1; }
  echo "A instalação do comando em $JUBART_BIN requer permissão administrativa."
  sudo -v
fi
if [ "$JUBART_INTERACTIVE" = true ]; then
  python3 scripts/install-wizard.py
fi
JUBART_NODE_IMAGE=$(sed -n 's/^NODE_VERSION=//p' .env.example)
[ -n "$JUBART_NODE_IMAGE" ] || { echo 'Imagem de inicialização não encontrada.' >&2; exit 1; }
echo 'Preparando configuração local; valores personalizados serão preservados…'
# Inspect only the local Docker daemon and the host route tables when choosing a subnet.
if [ -n "${DOCKER_CONTEXT:-}" ]; then
  JUBART_DOCKER_ENDPOINT=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
else
  JUBART_DOCKER_ENDPOINT=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}
fi
case "$JUBART_DOCKER_ENDPOINT" in unix://*) JUBART_DOCKER_SOCKET=${JUBART_DOCKER_ENDPOINT#unix://} ;; *) echo 'A reserva automática requer Docker local por socket Unix e as rotas do mesmo host.'; exit 1 ;; esac
JUBART_HOST_ROUTES=$(ip -j -4 route show table all)
export JUBART_HOST_ROUTES
docker run --rm --network none --user "$(id -u):$(id -g)" --group-add "$(stat -c %g "$JUBART_DOCKER_SOCKET")" -v "$JUBART_DOCKER_SOCKET:/var/run/docker.sock" -e JUBART_PROXY_AUTOINIT=true -e JUBART_HOST_ROUTES -v "$JUBART_ROOT:/workspace" -w /workspace -e "JUBART_HOST_DIRECTORY=$JUBART_ROOT" "node:$JUBART_NODE_IMAGE" node scripts/initialize-local.mjs
if [ "$JUBART_START" = true ]; then
  echo 'Construindo e iniciando o painel Jubart…'
  docker compose up -d --build --no-deps panel || { echo 'Falha ao construir/iniciar o painel. Consulte a seção Erros de instalação no README; para x509 verifique os certificados do host e do painel.' >&2; exit 1; }
  docker compose exec -T panel sh -c 'test -s /etc/ssl/certs/ca-certificates.crt' || { echo 'Certificados ausentes no painel. Confira o Dockerfile e recompile; consulte o README.' >&2; exit 1; }
fi
if [ -d "$JUBART_BIN" ] && [ -w "$JUBART_BIN" ]; then
  ln -sfn -- "$JUBART_ROOT/jubart" "$JUBART_LINK"
else
  sudo mkdir -p -- "$JUBART_BIN"
  sudo ln -sfn -- "$JUBART_ROOT/jubart" "$JUBART_LINK"
fi
printf '\nComando instalado: %s\n' "$JUBART_LINK"
case ":$PATH:" in *":$JUBART_BIN:"*) ;; *) echo "Inclua $JUBART_BIN no PATH para chamar jubart sem o caminho completo." ;; esac
"$JUBART_ROOT/jubart" panel
printf '\nConsulte PANEL_USERNAME e PANEL_PASSWORD no .env local para entrar.\nUse jubart help para conhecer os comandos.\n'
