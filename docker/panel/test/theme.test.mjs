import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/theme.js',import.meta.url),'utf8');
function fixture(saved=null,matches=false,unavailable=false){
 const listeners={},media={matches,addEventListener(_,cb){this.changed=cb;}},store=new Map(saved?[['infra-control-theme',saved]]:[]);
 const context={document:{documentElement:{dataset:{},style:{}}},localStorage:{getItem(key){if(unavailable)throw new Error('storage bloqueado');return store.get(key);},setItem(key,value){if(unavailable)throw new Error('storage bloqueado');store.set(key,value);}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},window:{matchMedia:()=>media,dispatchEvent(){},addEventListener(type,cb){listeners[type]=cb;}}};
 vm.runInNewContext(source,context);return {...context,media,store,listeners};
}
test('tema é definido sincronamente antes da renderização: claro padrão e preferência salva',()=>{
 for(const [saved,expected] of [[null,'light'],['invalid','light'],['dark','dark'],['light','light']]){
  const f=fixture(saved,true);assert.equal(f.document.documentElement.dataset.theme,expected);assert.equal(f.document.documentElement.dataset.bsTheme,expected);assert.equal(f.document.documentElement.style.colorScheme,expected);
 }
});
test('preferência sistema acompanha alterações e sincroniza entre abas',()=>{
 const f=fixture('system',false);assert.equal(f.document.documentElement.dataset.theme,'light');
 f.media.matches=true;f.media.changed();assert.equal(f.document.documentElement.dataset.theme,'dark');
 f.window.panelTheme.set('light');assert.equal(f.store.get('infra-control-theme'),'light');
 f.media.changed();assert.equal(f.document.documentElement.dataset.theme,'light');
 f.listeners.storage({key:'infra-control-theme',newValue:'dark'});assert.equal(f.window.panelTheme.get(),'dark');
 f.window.panelTheme.set('invalid');assert.equal(f.window.panelTheme.get(),'dark');
});
test('armazenamento indisponível não bloqueia o painel ou a seleção de tema',()=>{
 const f=fixture(null,false,true);assert.equal(f.document.documentElement.dataset.theme,'light');f.window.panelTheme.set('dark');assert.equal(f.document.documentElement.dataset.theme,'dark');
});
