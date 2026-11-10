import fs from 'node:fs/promises';
import path from 'node:path';
import {slots} from './core.mjs';
export const listProcessesScript=`for folder in /proc/[0-9]*; do
 pid=\${folder##*/}; [ "$pid" = "$$" ] && continue
 IFS= read -r stat 2>/dev/null < "$folder/stat" || continue
 IFS= read -r name 2>/dev/null < "$folder/comm" || continue
 rest=\${stat##*) }; set -- $rest
 [ "$#" -ge 20 ] || continue
 state=$1; parent=$2; shift 19; started=$1
 rss=0
 while IFS= read -r line; do case "$line" in VmRSS:*) set -- $line; rss=$2;; esac; done 2>/dev/null < "$folder/status"
 printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$pid" "$parent" "$started" "$state" "$rss" "$name"
 done`;
export const signalProcessScript=`pid=$1; expected=$2; signal=$3
 case "$pid" in ''|*[!0-9]*) exit 40;; esac
 [ "$pid" -gt 1 ] || exit 41
 case "$signal" in TERM|KILL) ;; *) exit 42;; esac
 IFS= read -r stat < "/proc/$pid/stat" || exit 43
 rest=\${stat##*) }; set -- $rest; [ "$#" -ge 20 ] || exit 43
 shift 19; [ "$1" = "$expected" ] || exit 44
 kill -"$signal" "$pid"`;
export function validateSignal(data){if(!Number.isInteger(data.pid)||data.pid<=1||data.pid>4194304||typeof data.started!=='string'||!/^\d{1,30}$/.test(data.started)||!['TERM','KILL'].includes(data.signal)||typeof data.container!=='string'||!/^[a-f0-9]{12,64}$/.test(data.container))throw new Error('PID, identificação do processo ou sinal inválido. PID 1 é protegido.');}
export function parseProcesses(text){return text.trim().split('\n').filter(Boolean).slice(0,1000).flatMap(line=>{const [pid,parent,started,state,rss,...name]=line.split('\t');if(!/^\d+$/.test(pid)||!/^\d+$/.test(started))return [];return [{pid:Number(pid),parent:Number(parent),started,state,rss:Number(rss)*1024,name:name.join(' ').replace(/[\x00-\x1f]/g,'').slice(0,80)}];});}
export function createAppProcesses({root,loadConfig,composeConfig,docker,startOperation}){
 async function target(id){const {config}=await loadConfig(),app=config.applications.find(a=>a.id===id&&a.enabled&&['php','node'].includes(a.type||'php'));if(!app)throw new Error('Selecione uma aplicação PHP ou Node habilitada.');const definition=await composeConfig(),service=slots[id].service;
 const ids=(await docker(['ps','-q','--filter',`label=com.docker.compose.project=${definition.name}`,'--filter',`label=com.docker.compose.service=${service}`,'--filter','label=com.docker.compose.oneoff=False'])).trim().split(/\s+/).filter(Boolean);if(ids.length!==1)throw new Error('Aplicação parada ou com múltiplas instâncias. Selecione uma instância antes de operar.');
 const inspect=JSON.parse(await docker(['inspect',ids[0]]))[0];if(inspect.Config?.Labels?.['com.docker.compose.project']!==definition.name||inspect.Config?.Labels?.['com.docker.compose.service']!==service||inspect.HostConfig?.PidMode)throw new Error('Container fora do projeto ou namespace de processos compartilhado.');return {app,service,container:inspect.Id};
 }
 async function audit(data){const directory=path.join(root,'.panel-state');await fs.mkdir(directory,{recursive:true,mode:0o700});const file=path.join(directory,'process-actions.jsonl');const stat=await fs.stat(file).catch(()=>null);if(stat?.size>1024*1024)await fs.rename(file,file+'.previous');await fs.appendFile(file,JSON.stringify({...data,at:new Date().toISOString()})+'\n',{mode:0o600});}
 return {async list(id){const t=await target(id);const text=await docker(['exec',t.container,'sh','-c',listProcessesScript],{timeout:10000,maxBuffer:512*1024});return {app:id,service:t.service,container:t.container,processes:parseProcesses(text),at:Date.now()};},async signal(id,data,actor){validateSignal(data);const t=await target(id);if(t.container!==data.container)throw new Error('O container foi recriado. Atualize a listagem.');return {operation:startOperation(`Encerrar processo ${data.pid} · ${t.app.name}`,async()=>{await audit({actor,app:id,container:t.container,pid:data.pid,signal:data.signal,state:'requested'});try{const current=await target(id);if(current.container!==t.container)throw new Error('Container alterado. Atualize a listagem.');await docker(['exec','--user','0',t.container,'sh','-c',signalProcessScript,'--',String(data.pid),data.started,data.signal],{timeout:10000});await audit({actor,app:id,pid:data.pid,signal:data.signal,state:'signal-sent'});}catch{await audit({actor,app:id,pid:data.pid,signal:data.signal,state:'failed'});throw new Error('Não foi possível sinalizar o processo: ele pode ter terminado, mudado ou recusado o sinal. Atualize a listagem.');}})};}};
}
