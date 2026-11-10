import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('Bootstrap 6 está fixado localmente, íntegro e carregado antes dos estilos do painel',async()=>{
 const base=new URL('../public/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('vendor/bootstrap/manifest.json',base),'utf8'));
 assert.equal(manifest.version,'6.0.0-alpha.1');
 for(const [name,hash] of Object.entries(manifest.sha256))assert.equal(createHash('sha256').update(await fs.readFile(new URL('vendor/bootstrap/'+name,base))).digest('hex'),hash);
 const html=await fs.readFile(new URL('index.html',base),'utf8');
 assert.ok(html.indexOf('/theme.js')<html.indexOf('/vendor/bootstrap/bootstrap.min.css'));
 assert.ok(html.indexOf('/vendor/bootstrap/bootstrap.min.css')<html.indexOf('/style.css'));
 assert.doesNotMatch(html,/https:\/\/cdn|\/design\.css/);
 assert.match(html,/src="\/react-app\.js"/);assert.doesNotMatch(html,/src="\/(app|ui|dialogs|bootstrap-ui)\.js"/);
 const bridge=await fs.readFile(new URL('../frontend/ui.jsx',base),'utf8');assert.match(bridge,/Dialog\.getOrCreateInstance/);assert.match(bridge,/instance\.dispose/);assert.match(bridge,/btn-solid/);assert.doesNotMatch(bridge,/btn-primary|form-select/);
});
