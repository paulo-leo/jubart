import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {proxyComposeArgs} from '../proxy-network.mjs';

test('inclui o overlay de produção após a rede quando presente', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jubart-overlay-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  assert.deepEqual(proxyComposeArgs(root), []);
  await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'config/proxy-network.compose.yaml'), '{}');
  await fs.writeFile(path.join(root, 'compose.production.yaml'), 'services: {}');
  assert.deepEqual(proxyComposeArgs(root), ['-f', path.join(root, 'config/proxy-network.compose.yaml'), '-f', path.join(root, 'compose.production.yaml')]);
});
