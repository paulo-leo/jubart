// Opt-in: only disposable containers/volume with random names; no published ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes, randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createPanel} from '../server.mjs';

test('MCP controla containers Docker descartáveis e lê volumes sem alcançar outro projeto', {
  skip: process.env.JUBART_MCP_DOCKER_QA !== '1', timeout: 60000,
}, async () => {
  const execute = promisify(execFile), project = 'jubart-mcp-test-' + randomBytes(6).toString('hex');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), project + '-'));
  const target = project + '-target', outsider = project + '-outsider', volume = project + '-data';
  const image = (await fs.readFile(new URL('../../../config/cli-image', import.meta.url), 'utf8')).trim();
  const docker = async args => (await execute('docker', args, {timeout: 30000, maxBuffer: 2 * 1024 * 1024})).stdout;
  const calls = [];
  let server, client;
  try {
    await docker(['image', 'inspect', image]);
    await docker(['volume', 'create', '--label', 'com.docker.compose.project=' + project, volume]);
    const code = "process.on('SIGTERM',()=>process.exit(0));console.log('mcp-probe-ready');setInterval(()=>{},1000)";
    for (const [name, owner] of [[target, project], [outsider, project + '-other']]) {
      await docker(['run', '-d', '--pull=never', '--init', '--name', name, '--label', 'com.docker.compose.project=' + owner, '--label', 'com.docker.compose.service=php', '--network', 'none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--pids-limit', '64', '--memory', '64m', ...(name === target ? ['--mount', `type=volume,source=${volume},target=/data`] : []), image, 'node', '-e', code]);
    }
    const inspect = async name => JSON.parse(await docker(['inspect', name]))[0];
    const outsiderBefore = await inspect(outsider);
    await fs.writeFile(path.join(root, '.env'), 'APP_DOMAIN=localhost\n');
    const executor = async (_, args) => {
      calls.push(args);
      if (args[0] === 'compose' && args.includes('config') && args.includes('--format')) return {stdout: JSON.stringify({name: project, services: {php: {image}, panel: {image}}})};
      if (args[0] === 'compose' && args.includes('logs')) return {stdout: await docker(['logs', '--tail', '1000', target])};
      return {stdout: await docker(args)};
    };
    const password = 'Disposable-test-password-only';
    server = createPanel({root, username: 'admin', password, executor});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/login', {method: 'POST', body: JSON.stringify({username: 'admin', password})});
    assert.equal(login.status, 200);
    const admin = {Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': (await login.json()).csrf, 'Content-Type': 'application/json'};
    const response = await fetch(base + '/api/mcp/keys', {method: 'POST', headers: admin, body: JSON.stringify({name: 'Disposable QA', scopes: ['read', 'execute'], actions: ['container.start', 'container.stop', 'container.restart']})});
    assert.equal(response.status, 201);
    const {token} = await response.json();
    client = new Client({name: 'disposable-docker-test', version: '1.0.0'});
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), {requestInit: {headers: {Authorization: 'Bearer ' + token}}}));
    const tool = async (name, arguments_) => {
      const result = await client.callTool({name, arguments: arguments_});
      assert.notEqual(result.isError, true, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const services = await tool('infra_read', {resource: 'services'});
    assert.deepEqual(services.services.map(s => s.name), ['php', 'panel']);
    assert.equal(services.services[0].container, target);
    const containerId = services.services[0].containerId;
    const volumes = await tool('infra_read', {resource: 'volumes'});
    assert.deepEqual(volumes.volumes.map(v => v.name), [volume]);
    assert.deepEqual(volumes.volumes[0].mounts, [{service: 'php', target: '/data', writable: true}]);
    assert.equal(JSON.stringify(volumes).includes('/var/lib/docker'), false);
    const logs = await tool('infra_read', {resource: 'logs', service: 'php'});
    assert.match(logs.logs, /mcp-probe-ready/);
    for (const action of ['container.stop', 'container.start', 'container.restart']) {
      const operation = {action, service: 'php', containerId}, payload = {requestId: randomUUID(), operation};
      const before = calls.filter(args => ['start', 'stop', 'restart'].includes(args[0])).length;
      assert.equal((await tool('infra_plan', {operation})).executes, false);
      assert.equal(calls.filter(args => ['start', 'stop', 'restart'].includes(args[0])).length, before);
      const receipt = await tool('infra_execute', payload);
      let status;
      for (let attempt = 0; attempt < 80; attempt++) {
        status = await tool('operation_status', {id: receipt.operation.id});
        if (status.operation.state !== 'running') break;
        await new Promise(r => setTimeout(r, 100));
      }
      assert.equal(status.operation.state, 'success');
      assert.equal((await inspect(target)).State.Running, action !== 'container.stop');
      assert.equal((await tool('infra_execute', payload)).operation.id, receipt.operation.id);
      assert.equal(calls.filter(args => ['start', 'stop', 'restart'].includes(args[0])).length, before + 1);
    }
    const outsiderAfter = await inspect(outsider);
    assert.equal(outsiderBefore.State.StartedAt, outsiderAfter.State.StartedAt);
    assert.equal(outsiderAfter.State.Running, true);
  } finally {
    if (client) await client.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await docker(['rm', '-f', target, outsider]).catch(() => {});
    await docker(['volume', 'rm', volume]).catch(() => {});
    await fs.rm(root, {recursive: true, force: true});
  }
});
