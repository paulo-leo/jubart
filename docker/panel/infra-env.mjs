import {createHash} from 'node:crypto';
export function envEntries(text){
 const lines=text.split(/\r?\n/),entries=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);if(!match)continue;
  const line=i+1,key=match[1];let raw=match[2].trim(),value=raw,invalid=false;
  if(raw.startsWith('"')||raw.startsWith("'")){const quote=raw[0];let end=-1;const closing=s=>{for(let n=1;n<s.length;n++){if(s[n]==='\\'){n++;continue;}if(s[n]===quote)return n;}return -1;};end=closing(raw);while(end<0&&i+1<lines.length){raw+='\n'+lines[++i];end=closing(raw);}invalid=end<0;value=invalid?'':raw.slice(1,end);}else value=raw.replace(/\s+#.*$/,'').trim();
  const sensitive=invalid||/PASS|PWD|SECRET|TOKEN|KEY|CREDENTIAL|AUTH|PRIVATE|DSN|COOKIE/i.test(key)||/[a-z][a-z0-9+.-]*:\/\/[^\s/]*@/i.test(value)||/-----BEGIN .*PRIVATE KEY-----/.test(value)||/"(?:password|token|secret|private_key)"\s*:/i.test(value);
  entries.push({id:key+':'+line,key,line,group:key.split('_')[0].toUpperCase(),value,sensitive,invalid});
 }
 const counts=new Map();for(const e of entries)counts.set(e.key,(counts.get(e.key)||0)+1);return entries.map(e=>({...e,duplicate:counts.get(e.key)>1}));
}
export function createInfraEnv({readEnv,audit}){
 const revision=text=>createHash('sha256').update(text).digest('hex');
 return {async read(actor){const text=await readEnv(),variables=envEntries(text).map(e=>({...e,value:e.sensitive?null:e.value}));await audit({actor,event:'infra.env.list',count:variables.length});return {revision:revision(text),variables,source:'.env da infraestrutura',note:'Valores declarados no arquivo, sem expandir variáveis ${...} nem resolver precedência do Compose. Esta tela é somente leitura; use as áreas específicas para editar e aplicar.'};},async reveal(data,actor){if(!data||typeof data.id!=='string'||typeof data.revision!=='string')throw new Error('Dados de consulta inválidos.');const text=await readEnv();if(data.revision!==revision(text))throw Object.assign(new Error('.env alterado. Atualize a listagem antes de consultar.'),{status:409});const e=envEntries(text).find(e=>e.id===data.id);if(!e||e.invalid)throw new Error('Variável não encontrada ou declaração inválida.');await audit({actor,event:'infra.env.reveal',key:e.key,line:e.line});return {key:e.key,value:e.value};}};
}
