import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationId} from '../frontend/notification-id.js';

test('usa randomUUID quando disponível no navegador',()=>{
 const source={randomUUID(){assert.equal(this,source);return 'browser-uuid';}};
 assert.equal(notificationId(source),'browser-uuid');
});
test('HTTP sem randomUUID gera identificadores distintos mesmo no mesmo milissegundo',t=>{
 t.mock.method(Date,'now',()=>1794830400000);
 const ids=Array.from({length:1000},()=>notificationId({}));
 assert.equal(new Set(ids).size,1000);
 assert.ok(ids.every(id=>/^notice-[a-z0-9]+-[a-z0-9]+$/.test(id)));
});
test('identificadores visuais funcionam mesmo sem objeto crypto',()=>{
 assert.match(notificationId(null),/^notice-/);
});
