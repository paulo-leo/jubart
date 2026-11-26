#!/usr/bin/env bash
set -euo pipefail
umask 077
agent_root=$(cd -- "${1:?Informe a instalação}" && pwd -P)
[[ "$agent_root" != *$'\n'* && "$agent_root" != *$'\r'* ]] || exit 1
command -v systemctl >/dev/null || { echo 'systemd de usuário não disponível; use jubart host-agent em primeiro plano.' >&2; exit 1; }
agent_hash=$(printf '%s' "$agent_root" | sha256sum);agent_hash=${agent_hash:0:12}
agent_unit="jubart-host-agent-$agent_hash.service"
agent_config="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p -- "$agent_config"
quote_unit(){ local value=${1//\\/\\\\};value=${value//\"/\\\"};value=${value//%/%%};printf '"%s"' "$value"; }
{
 printf '[Unit]\nDescription=Jubart - agente Bash do host\n\n[Service]\nType=simple\nExecStart=/usr/bin/bash '
 quote_unit "$agent_root/scripts/host-agent.sh";printf ' ';quote_unit "$agent_root";printf '\n'
 agent_workdir=${agent_root//%/%%};printf 'WorkingDirectory=%s\n' "$agent_workdir"
 printf 'UMask=0077\nNoNewPrivileges=yes\nRestart=on-failure\nRestartSec=2\nKillMode=control-group\nTimeoutStopSec=8\n\n[Install]\nWantedBy=default.target\n'
} >"$agent_config/$agent_unit"
systemctl --user daemon-reload
systemctl --user enable --now "$agent_unit"
printf 'Agente configurado como serviço do usuário: %s\n' "$agent_unit"
printf 'Para encerrar: systemctl --user stop %s\n' "$agent_unit"
