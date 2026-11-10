import test from 'node:test';
import assert from 'node:assert/strict';
import {changePlan} from '../public/change-plan.js';
test('cadastro de worker explica configuração, execução e impacto sem iniciar o processo',()=>{
 const plan=changePlan('/automation/register',{kind:'worker',app:'main',queue:'emails',connection:'redis',tries:3,timeout:60,sleep:3,stopGrace:90});
 assert.ok(plan.summary.some(([key,value])=>key==='Fila'&&value==='emails'));
 assert.match(plan.execution,/automation.json/);assert.match(plan.impact,/não inicia/);
});
test('todas as famílias de alterações têm resumo de execução e impacto; segredos não são reproduzidos',()=>{
 const routes=['/php/save','/php/apply','/config','/apply','/config/import','/apps/main/env','/services/php/exec','/services/php/stop','/logs/clear','/automation/register','/automation/job-aaaaaaaaaaaa/dispatch','/automation/apps/main/retry','/automation/apps/main/schedule-run','/logout','/future/action'];
 for(const engine of ['mariadb','postgres'])for(const action of ['create-database','create-user','password','lock','unlock','grant','revoke','reveal','backup-settings','backup-run'])routes.push(`/databases/${engine}/${action}`);
 const secret='NEVER_SHOW_THIS_SECRET';
 for(const route of routes){const plan=changePlan(route,{password:secret,content:secret,command:secret,arguments:[secret],s3AccessKeyId:secret,s3SecretAccessKey:secret});assert.ok(plan.execution&&plan.impact&&plan.confirmLabel,route);assert.ok(!JSON.stringify(plan).includes(secret),route);}
});
