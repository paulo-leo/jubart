import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from '../docker/panel/core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--history')){console.error('Uso: node scripts/check-publication.mjs [--history]');process.exit(2);}
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const files=git('ls-files','-z').toString().split('\0').filter(Boolean);
const forbidden=file=>file!=='.env.example'&&(/^(?:\.env(?:\.|$)|\.panel-state\/|\.git-publication-backup\/|backups\/|app(?:2|3)?\/|projects\/)/.test(file)||/(?:^|\/)\.env(?:\.|$)/.test(file)||/^config\/(?:apps\.json|apps\..*yaml|automation(?:\.compose)?\.json|external-tools\.json|runtime-images\.lock\.json)$/.test(file)||/^docker\/traefik\/(?:security\.(?:json|yml)|extra-apps\.(?:json|yml)|(?:websocket|mercure)-.*\.(?:json|yml))$/.test(file));
const known=[];
try{for(const [name,value]of Object.entries(parseEnv(fs.readFileSync(path.join(root,'.env'),'utf8'))))if(/PASSWORD|SECRET|TOKEN|ACCESS_KEY|VAULT_KEY/.test(name)&&value.length>=12&&!/^(?:troque-|gere-)/.test(value))known.push(value);}catch(error){if(error.code!=='ENOENT')throw error;}
const secret=data=>known.some(value=>data.includes(value))||/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(data)||/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|AKIA[0-9A-Z]{16})\b/.test(data);
let failed=false;
function report(label,names){if(names.length){failed=true;console.error(label+'\n'+[...new Set(names)].sort().join('\n'));}}
report('Arquivos locais ainda versionados:',files.filter(forbidden));
report('Possíveis segredos no conteúdo do índice Git (valores omitidos):',files.filter(file=>secret(git('show',':'+file).toString())));
// Also inspect files eligible for the next git add, without changing the index.
const candidates=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
report('Possíveis segredos nos arquivos de trabalho publicáveis (valores omitidos):',candidates.filter(file=>{const full=path.join(root,file);try{return fs.lstatSync(full).isFile()&&secret(fs.readFileSync(full,'utf8'));}catch(error){if(error.code==='ENOENT')return false;throw error;}}));
if(args.includes('--history')){
 const entries=git('rev-list','--objects','--all').toString().split('\n').filter(Boolean).map(line=>{const i=line.indexOf(' ');return {id:i<0?line:line.slice(0,i),name:i<0?'':line.slice(i+1)};});
 report('Arquivos locais presentes no histórico Git:',entries.filter(entry=>entry.name&&forbidden(entry.name)).map(entry=>entry.name));
 const found=[];for(const entry of entries){if(!entry.name||git('cat-file','-t',entry.id).toString().trim()!=='blob')continue;if(secret(git('cat-file','-p',entry.id).toString()))found.push(entry.name);}report('Possíveis segredos no histórico Git (valores omitidos):',found);
}
if(failed){console.error('Revisão necessária antes de publicar. Nenhum arquivo ou commit foi alterado.');process.exitCode=1;}
else console.log('Verificações de caminhos locais e padrões de segredos concluídas sem ocorrências'+(args.includes('--history')?' no índice, arquivos publicáveis e histórico.':'. Use --history para incluir os commits anteriores.')+' Não substitui revisão manual nem detecta todos os segredos.');
