import test from 'node:test';
import assert from 'node:assert/strict';
import {findReadmeMatches,highlightReadme} from '../frontend/readme-search.js';
test('busca literal ignora caixa e acentos, preserva posições e não interpreta regex',()=>{
 assert.deepEqual(findReadmeMatches('Configuração e CONFIGURACAO','configuracao'),[[0,12],[15,27]]);
 assert.deepEqual(findReadmeMatches('Use .env; não qualquer aenv','.env'),[[4,8]]);
 assert.deepEqual(findReadmeMatches('texto','   '),[]);
 assert.deepEqual(findReadmeMatches('🌍 PHP e PHP','php'),[[3,6],[9,12]]);
});
test('destaca texto e código sem alterar links e sem injetar HTML',()=>{
 const link={type:'element',tagName:'a',properties:{href:'#backup'},children:[{type:'text',value:'Backup'}]},code={type:'element',tagName:'code',properties:{},children:[{type:'text',value:'backup --all'}]};
 const tree={type:'root',children:[link,code]};highlightReadme({query:'backup'})(tree);
 assert.equal(link.properties.href,'#backup');assert.equal(link.children[0].tagName,'mark');assert.equal(code.children[0].tagName,'mark');assert.equal(link.children[0].children[0].value,'Backup');
 const literal={type:'root',children:[{type:'text',value:'<script>teste</script>'}]};highlightReadme({query:'<script>'})(literal);assert.equal(literal.children[0].tagName,'mark');assert.equal(literal.children[0].children[0].type,'text');assert.equal(literal.children[0].children[0].value,'<script>');
});
