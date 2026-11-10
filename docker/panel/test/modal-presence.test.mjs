import test from 'node:test';
import assert from 'node:assert/strict';
import {createModalPresence} from '../frontend/modal-presence.js';
test('modal permanece montado ao fechar até a animação terminar',()=>{
 const store=createModalPresence();let changes=0;const unsubscribe=store.subscribe(()=>changes++);
 store.set('editor',{title:'Editar'});assert.equal(store.snapshot()[0].leaving,false);
 store.leave('editor');assert.equal(store.snapshot().length,1);assert.equal(store.snapshot()[0].leaving,true);assert.equal(store.snapshot()[0].props.title,'Editar');
 store.remove('editor');assert.equal(store.snapshot().length,0);assert.equal(changes,3);unsubscribe();store.set('other',{});assert.equal(changes,3);
});
test('atualização de conteúdo preserva as outras janelas e reabertura cancela saída',()=>{
 const store=createModalPresence();store.set('editor',{title:'Editar'});store.set('confirm',{title:'Confirmar'});store.leave('confirm');store.set('editor',{title:'Editado'});assert.equal(store.snapshot()[1].leaving,true);store.set('confirm',{title:'Nova confirmação'});assert.equal(store.snapshot()[1].leaving,false);assert.equal(store.snapshot()[0].props.title,'Editado');
});
