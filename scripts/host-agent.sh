#!/usr/bin/env bash
# Host PTY bridge. Runs as the operator, without Python, Node or Docker on the host.
set -euo pipefail
umask 077
agent_root=$(cd -- "${1:?Informe a raiz da instalação}" && pwd -P)
agent_state="$agent_root/.jubart-host-agent"
for utility in bash script setsid base64 stat; do command -v "$utility" >/dev/null || { echo "Utilitário necessário: $utility" >&2; exit 1; }; done
[[ $(uname -s) == Linux ]] || { echo 'O agente requer Linux ou WSL.' >&2; exit 1; }
[[ ! -L "$agent_state" ]] || { echo 'Diretório do agente não pode ser um link.' >&2; exit 1; }
mkdir -p -- "$agent_state/requests" "$agent_state/sessions"
chmod 700 "$agent_state" "$agent_state/requests" "$agent_state/sessions"
if ! mkdir -- "$agent_state/lock" 2>/dev/null; then echo 'Há outro agente ativo ou um lock que precisa ser conferido.' >&2; exit 1; fi
agent_generation=$(tr -d '-' </proc/sys/kernel/random/uuid)
agent_children=()
cleanup(){
 trap - EXIT TERM INT
 agent_jobs=$(jobs -pr)
 for child in $agent_jobs; do kill -TERM "$child" 2>/dev/null || true; done
 wait || true
 rm -f -- "$agent_state/agent" "$agent_state/alive"
 rmdir -- "$agent_state/lock" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
printf '%s\n' 1 "$$" "$(id -u)" "$(id -un)" "$agent_generation" >"$agent_state/agent"
run_session(){
 local request=$1 session_id directory encoded identity generation session_path shell_pid='' started current last_input last_backend reason='process-exited'
 mapfile -t fields <"$request"
 rm -f -- "$request"
 session_id=${fields[0]:-}; encoded=${fields[1]:-}; identity=${fields[2]:-}; generation=${fields[3]:-}
 [[ "$session_id" =~ ^[a-f0-9]{48}$ && "$generation" == "$agent_generation" && "$identity" =~ ^[0-9]+:[0-9]+$ ]] || return
 session_path="$agent_state/sessions/$session_id"
 mkdir -- "$session_path" 2>/dev/null || return
 trap '[[ -z "$shell_pid" ]] || kill -TERM -- "-$shell_pid" 2>/dev/null || true; printf "%s\n" "$reason" >"$session_path/closed"' EXIT
 trap 'reason=agent-stopped; exit 0' TERM INT
 directory=$(printf '%s' "$encoded" | base64 --decode) || return
 [[ "$directory" == /* && "$(readlink -f -- "$directory")" == "$directory" && -d "$directory" && -r "$directory" && -x "$directory" ]] || { reason=invalid-directory; return; }
 cd -P -- "$directory" || return
 [[ "$(stat -c '%d:%i' .)" == "$identity" ]] || { reason=directory-changed; return; }
 mkfifo -m 600 -- "$session_path/input"
 : >"$session_path/output"
 touch "$session_path/activity" "$session_path/backend"
 exec 9<>"$session_path/input"
 setsid script --quiet --return --flush --command 'exec bash --noprofile --norc -i' /dev/null <"$session_path/input" >"$session_path/output" 2>&1 &
 shell_pid=$!; started=$(date +%s)
 printf '%s\n' "$shell_pid" >"$session_path/ready"
 while kill -0 "$shell_pid" 2>/dev/null; do
  current=$(date +%s);last_input=$(stat -c %Y "$session_path/activity");last_backend=$(stat -c %Y "$session_path/backend")
  if [[ -e "$session_path/close" ]]; then reason=closed; break; fi
  if (( current-last_backend > 20 )); then reason=backend-disconnected; break; fi
  if (( current-last_input > 900 || current-started > 3600 )); then reason=expired; break; fi
  if (( $(stat -c %s "$session_path/output") > 1048576 )); then reason=output-limit; break; fi
  sleep 0.2
 done
 kill -TERM -- "-$shell_pid" 2>/dev/null || true
 wait "$shell_pid" 2>/dev/null || true
 exec 9>&-
 printf '%s\n' "$reason" >"$session_path/closed"
 shell_pid=''
}
echo "Agente de Bash do Jubart ativo como $(id -un). Ctrl+C encerra as sessões."
agent_cleanup_tick=0
while :; do
 touch "$agent_state/alive"
 for request in "$agent_state/requests/"*.request; do
  [[ -f "$request" && ! -L "$request" ]] || continue
  request_name=${request##*/}; [[ "$request_name" =~ ^[a-f0-9]{48}\.request$ ]] || continue
  # One host shell per installation. Refuse requests while a session is active.
  active=false
  if [[ -n $(jobs -pr) ]]; then active=true; fi
  for session in "$agent_state/sessions/"*; do [[ ! -d "$session" || -e "$session/closed" ]] || active=true; done
  if $active; then rm -f -- "$request"; continue; fi
  mv -- "$request" "$request.running"
  run_session "$request.running" & agent_children+=("$!")
 done
 agent_cleanup_tick=$((agent_cleanup_tick+1))
 if (( agent_cleanup_tick >= 300 )); then
  agent_cleanup_tick=0
  for session in "$agent_state/sessions/"*; do
   [[ -d "$session" && ! -L "$session" && -f "$session/closed" ]] || continue
   if (( $(date +%s)-$(stat -c %Y "$session/closed") > 3600 )); then rm -f -- "$session/input" "$session/output" "$session/activity" "$session/backend" "$session/ready" "$session/closed" "$session/close"; rmdir -- "$session" 2>/dev/null || true; fi
  done
 fi
 sleep 0.2
done
