import http from 'node:http';
import {createHash} from 'node:crypto';

const actions=new Set(['die','stop','start','restart','pause','unpause']);
const serviceName=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
export function dockerServiceEvent(value,project){
 const labels=value?.Actor?.Attributes||{},action=value?.Action||value?.status;
 if(value?.Type!=='container'||!actions.has(action)||labels['com.docker.compose.project']!==project||labels['com.docker.compose.oneoff']?.toLowerCase()==='true'||!serviceName.test(labels['com.docker.compose.service']||''))return null;
 const container=value.Actor?.ID||value.id,nano=String(value.timeNano||'');
 if(!/^[a-f0-9]{64}$/.test(container||'')||!/^\d{16,24}$/.test(nano))return null;
 const milliseconds=Number(BigInt(nano)/1000000n);if(!Number.isFinite(milliseconds)||!Number.isFinite(new Date(milliseconds).getTime()))return null;
 return {service:labels['com.docker.compose.service'],containerId:container.slice(0,12),action:['die','stop','pause'].includes(action)?'stopped':action==='restart'?'restarted':'started',dockerAction:action,timeNano:nano,at:new Date(milliseconds).toISOString(),fingerprint:createHash('sha256').update(container+':'+action+':'+nano).digest('hex')};
}

// Read-only Engine stream. No shell commands, Docker credentials or raw attributes are exposed.
export function createDockerEvents({scope,cursor=async()=>null,onEvent,onStatus=()=>{},socketPath='/var/run/docker.sock',request=http.request,now=Date.now,reconnectMs=1000,startSettleMs=500,enabled=true}){
 let stopped=true,generation=0,connection,response,retry,connecting,failures=0,firstSince,serial=Promise.resolve();
 const starts=new Map();
 const exclusive=work=>{const task=serial.then(work);serial=task.catch(()=>{});return task;};
 const status=state=>{try{onStatus(state);}catch{}};
 async function flush(id){const entry=starts.get(id);if(!entry)return;starts.delete(id);clearTimeout(entry.timer);await onEvent(entry.event);}
 async function consume(event){
  const id=event.containerId;
  if(event.action==='started'){
   await flush(id);if(starts.size>=500)await flush(starts.keys().next().value);
   const entry={event,timer:setTimeout(()=>{void exclusive(()=>flush(id)).catch(()=>{connection?.destroy();});},startSettleMs)};entry.timer.unref();starts.set(id,entry);return;
  }
  if(event.action==='restarted'){const previous=starts.get(id);if(previous){clearTimeout(previous.timer);starts.delete(id);}}
  else await flush(id);
  await onEvent(event);
 }
 function schedule(version){if(stopped||version!==generation)return;clearTimeout(retry);status('reconnecting');retry=setTimeout(()=>{void connect(version);},Math.min(30000,reconnectMs*2**Math.min(failures++,5)));retry.unref();}
 async function connect(version){
  if(stopped||version!==generation)return;status('connecting');
  try{
   const {project}=await scope();if(!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(project||''))throw new Error();
   const checkpoint=await cursor(),since=/^\d{16,24}$/.test(checkpoint||'')?Math.max(0,Number(BigInt(checkpoint)/1000000000n)-2):firstSince;
   if(stopped||version!==generation)return;
   const filters={type:['container'],label:['com.docker.compose.project='+project],event:[...actions]};
   const route='/v1.47/events?'+new URLSearchParams({since:String(since),filters:JSON.stringify(filters)});
   await new Promise((resolve,reject)=>{
    connection=request({socketPath,path:route,method:'GET',headers:{Accept:'application/json'}},res=>{
     response=res;connection?.setTimeout(0);
     if(res.statusCode!==200){res.destroy();reject(new Error());return;}
     failures=0;status('connected');
     void (async()=>{
      let buffer='';res.setEncoding('utf8');
      for await(const chunk of res){
       buffer+=chunk;
       let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(Buffer.byteLength(line)>65536)throw new Error();if(!line.trim())continue;
        // Node 24 preserves the original integer source; nanoseconds exceed Number precision.
        const value=JSON.parse(line,(key,value,context)=>key==='timeNano'&&typeof value==='number'?context.source:value),event=dockerServiceEvent(value,project);
        if(event&&!stopped&&version===generation)await exclusive(()=>consume(event));
       }
       if(Buffer.byteLength(buffer)>65536)throw new Error();
      }
     })().then(resolve,reject);
    });
    connection.setTimeout(10000,()=>connection?.destroy(new Error()));connection.on('error',reject);connection.end();
   });
  }catch{response?.destroy();connection?.destroy();}
  finally{await exclusive(async()=>{for(const id of [...starts.keys()])await flush(id);}).catch(()=>{});schedule(version);}
 }
 return {
  async start(){if(!stopped)return;stopped=false;firstSince=Math.floor(now()/1000);const version=++generation;if(!enabled){status('disabled');return;}connecting=connect(version);},
  async stop(){stopped=true;++generation;clearTimeout(retry);response?.destroy();connection?.destroy();for(const entry of starts.values())clearTimeout(entry.timer);await connecting?.catch(()=>{});await exclusive(async()=>{for(const id of [...starts.keys()])await flush(id);});status('disconnected');},
 };
}
