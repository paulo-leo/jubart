import test from 'node:test';
import assert from 'node:assert/strict';
import {architectureFlow,visibleArchitectureLinks,pointOnFlow} from '../frontend/architecture-flow.mjs';
const route=(...nodes)=>nodes.map(node=>({node}));
test('ida e volta reutilizam cartões e invertem a direção da mesma conexão',()=>{
 const flow=architectureFlow(route('client','proxy','app','database','app','proxy','client'),'request');
 assert.equal(flow.cards.length,4);assert.equal(flow.edges.length,3);assert.deepEqual(flow.cards.find(c=>c.id==='app').steps,[2,4]);
 assert.equal(visibleArchitectureLinks(flow,2).find(l=>l.key==='app:proxy').from,'proxy');
 const returned=visibleArchitectureLinks(flow,5).find(l=>l.key==='app:proxy');assert.equal(returned.from,'app');assert.equal(returned.to,'proxy');assert.deepEqual(flow.steps[2].points,[...flow.steps[5].points].reverse());assert.equal(pointOnFlow(returned,.5).angle,180);
 const last=flow.steps[6];assert.equal(last.to,'client');assert.ok(pointOnFlow(last,1).x<pointOnFlow(last,0).x);
});
test('página de erro sai e volta pelo mesmo proxy, com um ramal próprio',()=>{
 const flow=architectureFlow(route('client','proxy','app','proxy','errors','proxy','client'),'error');assert.equal(flow.cards.length,4);assert.equal(flow.edges.length,3);
 const proxy=flow.cards.find(c=>c.id==='proxy'),errors=flow.cards.find(c=>c.id==='errors');assert.equal(proxy.x,errors.x);assert.ok(errors.y>proxy.y);assert.deepEqual(flow.steps[4].points,[...flow.steps[5].points].reverse());assert.equal(pointOnFlow(flow.steps[5],.5).angle,-90);
});
test('retornos de build e administração não duplicam componentes; movimento acompanha as curvas',()=>{
 const flow=architectureFlow(route('source','configuration','build','images','engine','panel','build','network','storage','app','panel'),'install');assert.equal(flow.cards.length,9);assert.deepEqual(flow.cards.find(c=>c.id==='build').steps,[2,6]);assert.deepEqual(flow.cards.find(c=>c.id==='panel').steps,[5,10]);const link=flow.steps[7];assert.equal(link.points.length,4);assert.deepEqual({...pointOnFlow(link,0),angle:0},{...link.points[0],angle:0});assert.deepEqual({...pointOnFlow(link,1),angle:0},{...link.points.at(-1),angle:0});
 const same=architectureFlow(route('app','app'),'request');assert.equal(same.cards.length,1);assert.equal(same.steps[1],null);
});
