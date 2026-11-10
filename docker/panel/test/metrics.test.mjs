import test from 'node:test';
import assert from 'node:assert/strict';
import { byteSize, parseDockerStats, parsePrometheus, httpDelta, createMetricsCollector } from '../metrics.mjs';
const prometheus = `# HELP example example
process_start_time_seconds 100
traefik_entrypoint_requests_total{entrypoint="web",code="200",method="GET"} 100
traefik_entrypoint_requests_total{entrypoint="websecure",code="500",method="POST"} 5
traefik_entrypoint_requests_total{entrypoint="metrics",code="200"} 9999
traefik_entrypoint_request_duration_seconds_sum{entrypoint="web"} 10
traefik_entrypoint_request_duration_seconds_count{entrypoint="web"} 100
traefik_router_requests_total{router="app-http@file",code="200"} 100
traefik_router_requests_total{router="app-http@file",code="500"} 5
traefik_router_requests_total{router="prometheus@internal",code="200"} 10000
`;
const stats = JSON.stringify({ ID:'abcdef123456',Name:'php',CPUPerc:'125.50%',MemUsage:'100MiB / 2GiB',MemPerc:'4.88%',NetIO:'1MB / 2MB',BlockIO:'3kB / 4kB',PIDs:'12' });
test('converte unidades Docker sem confundir MB e MiB',()=>{
 assert.equal(byteSize('2GiB'),2*1024**3);assert.equal(byteSize('2GB'),2e9);assert.equal(byteSize('inválido'),null);
 const row=parseDockerStats(stats)[0];assert.equal(row.cpuPercent,125.5);assert.equal(row.memoryBytes,100*1024**2);assert.equal(row.txBytes,2e6);assert.equal(row.pids,12);
});
test('conta tráfego web sem duplicar serviços ou a coleta de métricas',()=>{
 const result=parsePrometheus(prometheus);assert.equal(result.total,105);assert.equal(result.statuses['5xx'],5);assert.equal(result.routes.length,1);assert.equal(result.routes[0].requests,105);assert.equal(result.durationSum,10);
});
test('calcula taxa e latência por intervalo e descarta reset do Traefik',()=>{
 const before=parsePrometheus(prometheus),after={...before,total:115,durationSum:12,durationCount:110,statuses:{...before.statuses,'5xx':6}};
 assert.deepEqual(httpDelta(after,before,5),{requestsPerSecond:2,meanLatencyMs:200,errorsPerSecond:0.2,reset:false});
 assert.equal(httpDelta(before,null,5).requestsPerSecond,null);
 assert.equal(httpDelta({...before,processStartedAt:200},before,5).reset,true);
 assert.equal(httpDelta({...before,total:1},before,5).requestsPerSecond,null);
});
test('coleta somente containers do projeto e compartilha cache entre clientes',async()=>{
 const calls=[];let fetches=0;
 const docker=async args=>{calls.push(args);if(args[0]==='ps')return 'abcdef123456\n';if(args[0]==='stats')return stats;return '{"cpus":4,"memoryBytes":8589934592}';};
 const collector=createMetricsCollector({docker,composeConfig:async()=>({name:'laravel'}),fetcher:async()=>{fetches++;return{ok:true,text:async()=>prometheus};}});
 const [a,b]=await Promise.all([collector(),collector()]);assert.equal(a,b);assert.equal(fetches,1);assert.equal(a.current.totals.cpuPercent,125.5/4);assert.equal(a.current.http.total,105);assert.equal(a.current.http.requestsPerSecond,null);
 assert.ok(calls[0].includes('label=com.docker.compose.project=laravel'));assert.ok(calls.find(a=>a[0]==='stats').includes('abcdef123456'));
 await collector();assert.equal(fetches,1);
});
test('falha HTTP mantém consumo Docker, com indicação de coleta parcial',async()=>{
 const collector=createMetricsCollector({docker:async args=>args[0]==='ps'?'abc':args[0]==='stats'?stats:'{"cpus":4,"memoryBytes":8589934592}',composeConfig:async()=>({name:'laravel'}),fetcher:async()=>{throw new Error('offline');}});
 const result=await collector();assert.equal(result.current.http,null);assert.ok(result.current.httpError);assert.equal(result.current.containers.length,1);
});
