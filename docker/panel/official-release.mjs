import https from 'node:https';
import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const officialRepository='paulo-leo/jubart';
export const officialImage='paulo2021/jubart';
export const releaseVersion=value=>typeof value==='string'&&/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
export const compareVersions=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
export const blobHash=buffer=>createHash('sha1').update('blob '+buffer.length+'\0').update(buffer).digest('hex');
export const contentHash=buffer=>createHash('sha256').update(buffer).digest('hex');
export const updateFail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function publicReleasePath(file){
 if(typeof file!=='string'||!file||file.length>512||file.startsWith('/')||file.includes('\\')||file.split('/').some(p=>!p||p==='.'||p==='..')||/[\x00-\x1f]/.test(file))return false;
 if(file.split('/').some(p=>['.git','.env','.panel-state','.jubart-host-agent','node_modules','backups'].includes(p)))return false;
 if(['.env.example','.gitignore','.dockerignore','.editorconfig','README.md','DOCKER_HUB.md','THIRD_PARTY_NOTICES.md','LICENSE','LICENSE.md','CHANGELOG.md','compose.yaml','install.sh','jubart','icon.svg'].includes(file))return true;
 if(/^config\//.test(file))return ['config/cli-image','config/dependencies.licenses.json','config/images.lock.json'].includes(file);
 if(/^docker\/traefik\//.test(file))return ['docker/traefik/apps.yml','docker/traefik/errors.yml','docker/traefik/panel.yml','docker/traefik/routes.yml'].includes(file);
 return /^(?:docker|scripts|docs|distribution|\.github)\//.test(file);
}
async function limitedBody(response,limit){let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)updateFail('Resposta oficial excedeu o limite permitido.');chunks.push(chunk);}return Buffer.concat(chunks);}
let systemCA;try{systemCA=readFileSync('/etc/ssl/certs/ca-certificates.crt');}catch{}
const officialAgent=new https.Agent({proxyEnv:process.env,...(systemCA?{ca:systemCA}:{})});
export function officialFetch(url,{headers,signal}={}){return new Promise((resolve,reject)=>{const request=https.get(url,{headers,signal,agent:officialAgent},response=>{const headers=new Headers();for(const [key,value]of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);resolve(new Response(Readable.toWeb(response),{status:response.statusCode,headers}));});request.on('error',reject);});}
export function createOfficialSource({fetcher=officialFetch}={}){
 async function request(url,{json=true,limit=8*1024*1024}={}){
  let current=new URL(url);
  for(let redirect=0;redirect<4;redirect++){
   if(current.protocol!=='https:'||!['api.github.com','codeload.github.com','hub.docker.com'].includes(current.hostname)||current.username||current.password)updateFail('Origem de atualização não permitida.');
   let response;try{response=await fetcher(current.href,{headers:{Accept:'application/vnd.github+json','User-Agent':'Jubart-official-updater'},redirect:'manual',signal:AbortSignal.timeout(45000)});}catch{updateFail('Não foi possível acessar a origem oficial. Verifique rede, DNS, certificados HTTPS e proxy de saída.',502);}
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)updateFail('Redirecionamento oficial inválido.');current=new URL(location,current);continue;}
   if(!response.ok)updateFail(response.status===403||response.status===429?'A origem oficial limitou as consultas. Aguarde e tente novamente.':'Não foi possível consultar a versão oficial (HTTP '+response.status+').',502);
   const body=await limitedBody(response,limit);if(!json)return body;try{return JSON.parse(body);}catch{updateFail('A origem oficial retornou dados inválidos.',502);}
  }
  updateFail('Redirecionamentos excedidos na origem oficial.',502);
 }
 async function tags(){const rows=await request('https://api.github.com/repos/'+officialRepository+'/tags?per_page=100');if(!Array.isArray(rows))updateFail('Catálogo oficial inválido.',502);return rows.filter(row=>releaseVersion(row.name?.slice(1))&&row.name.startsWith('v')&&/^[a-f0-9]{40}$/.test(row.commit?.sha)).map(row=>({version:row.name.slice(1),commit:row.commit.sha,url:'https://github.com/'+officialRepository+'/tree/'+row.name})).sort((a,b)=>compareVersions(b.version,a.version));}
 async function tree(commit){if(!/^[a-f0-9]{40}$/.test(commit))updateFail('Revisão oficial inválida.');const result=await request('https://api.github.com/repos/'+officialRepository+'/git/trees/'+commit+'?recursive=1');if(result.truncated||!Array.isArray(result.tree)||result.tree.length>4096)updateFail('A árvore da versão está incompleta ou excede o limite suportado.');const files={};for(const row of result.tree){if(row.type==='tree')continue;if(row.type!=='blob'||!['100644','100755'].includes(row.mode)||!publicReleasePath(row.path)||!/^[a-f0-9]{40}$/.test(row.sha))updateFail('Arquivo da versão não permitido: '+String(row.path).slice(0,512));files[row.path]={sha:row.sha,mode:row.mode==='100755'?0o755:0o644};}return files;}
 async function image(version,cli=false){if(!releaseVersion(version))updateFail('Versão inválida.');const tag=(cli?'cli-':'')+version,row=await request('https://hub.docker.com/v2/repositories/'+officialImage+'/tags/'+tag);const candidates=(row.images||[]).filter(i=>i.os==='linux'&&i.architecture==='amd64'&&/^sha256:[a-f0-9]{64}$/.test(i.digest));if(candidates.length!==1)updateFail('Imagem oficial linux/amd64 não disponível para '+tag+'.',409);return {tag,digest:candidates[0].digest,reference:officialImage+'@'+candidates[0].digest};}
 async function archive(commit,files){const body=await request('https://api.github.com/repos/'+officialRepository+'/tarball/'+commit,{json:false,limit:48*1024*1024});return parseReleaseArchive(body,files);}
 return {tags,tree,image,archive};
}
function paxValues(buffer){let offset=0,result={};while(offset<buffer.length){const space=buffer.indexOf(32,offset),length=Number(buffer.subarray(offset,space).toString());if(space<0||!Number.isInteger(length)||length<5||offset+length>buffer.length)updateFail('Cabeçalho do pacote inválido.');const item=buffer.subarray(space+1,offset+length-1).toString(),equal=item.indexOf('=');if(equal<1)updateFail('Metadados do pacote inválidos.');result[item.slice(0,equal)]=item.slice(equal+1);offset+=length;}return result;}
export function parseReleaseArchive(compressed,files){
 let tar;try{tar=gunzipSync(compressed,{maxOutputLength:96*1024*1024});}catch{updateFail('Pacote oficial inválido ou maior que o limite suportado.');}
 const result=new Map();let offset=0,pax={},wrapper;
 while(offset+512<=tar.length){const header=tar.subarray(offset,offset+512);offset+=512;if(header.every(byte=>byte===0))break;
  const string=(start,size)=>header.subarray(start,start+size).toString('utf8').replace(/\0.*$/s,'');
  const octal=(start,size)=>{const value=string(start,size).trim();if(!/^[0-7]+$/.test(value))updateFail('Número inválido no pacote.');return parseInt(value,8);};
  const checksum=octal(148,8),sum=header.reduce((total,byte,index)=>total+(index>=148&&index<156?32:byte),0);if(checksum!==sum)updateFail('Checksum inválido no pacote oficial.');
  const size=octal(124,12),type=string(156,1)||'0';if(size>16*1024*1024||offset+size>tar.length)updateFail('Arquivo do pacote excede o limite.');const bytes=tar.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;
  if(type==='g'){const global=paxValues(bytes);if(Object.keys(global).some(k=>!['comment','mtime','atime','ctime'].includes(k)))updateFail('Metadados globais não suportados.');continue;}
  if(type==='x'){pax=paxValues(bytes);continue;}
  let full=pax.path||[string(345,155),string(0,100)].filter(Boolean).join('/');pax={};
  if(full.startsWith('/')||full.includes('\\')||full.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f]/.test(full))updateFail('Caminho inseguro no pacote.');
  const split=full.indexOf('/');if(split<1)updateFail('Raiz do pacote inválida.');const top=full.slice(0,split);wrapper??=top;if(wrapper!==top)updateFail('Múltiplas raízes no pacote.');const file=full.slice(split+1).replace(/\/$/,'');
  if(type==='5')continue;if(type!=='0'||!publicReleasePath(file)||!files[file]||result.has(file))updateFail('Entrada não permitida no pacote: '+file);
  if(blobHash(bytes)!==files[file].sha)updateFail('Conteúdo do pacote não corresponde à revisão GitHub: '+file);result.set(file,Buffer.from(bytes));
 }
 if(result.size!==Object.keys(files).length)updateFail('O pacote está incompleto para a revisão selecionada.');return result;
}
