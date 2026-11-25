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
for JUBART_TOOL in docker readlink stat mktemp mkfifo; do
  command -v "$JUBART_TOOL" >/dev/null 2>&1 || { echo "Instale $JUBART_TOOL antes de continuar." >&2; exit 1; }
done
. "$JUBART_ROOT/scripts/cli-runtime.sh"
jubart_runtime_prepare
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
  jubart_runtime python3 /usr/local/lib/jubart/scripts/install-wizard.py
fi
echo 'Preparando configuração local; valores personalizados serão preservados…'
jubart_runtime sh -c 'export JUBART_HOST_ROUTES="$(ip -j -4 route show table all)"; export JUBART_PROXY_AUTOINIT=true JUBART_HOST_DIRECTORY="$JUBART_ROOT"; exec node scripts/initialize-local.mjs'
if [ "$JUBART_START" = true ]; then
  echo 'Construindo e iniciando o painel Jubart…'
  jubart_runtime docker compose up -d --build --no-deps panel || { echo 'Falha ao construir/iniciar o painel. Consulte a seção Erros de instalação no README.' >&2; exit 1; }
  jubart_runtime docker compose exec -T panel sh -c 'test -s /etc/ssl/certs/ca-certificates.crt' || { echo 'Certificados ausentes no painel. Confira o Dockerfile e recompile; consulte o README.' >&2; exit 1; }
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
