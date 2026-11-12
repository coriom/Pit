import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCoolifyRawCanary } from './check-coolify-raw-canary.mjs';

const uuid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const root = fileURLToPath(new URL('../../', import.meta.url));
const password = 'synthetic-password-for-compose-check-0001';
const env = {
  ...process.env,
  PIT_DB_PASSWORD: password,
  PIT_DATABASE_URL: `postgres://pit_api:${password}@pit-db:5432/pit_crypto`,
  PIT_BACKEND_INVITE_SHA256: 'a'.repeat(64),
  PIT_EDGE_HMAC_KEY: 'synthetic-hmac-for-compose-check-0001',
};
const render = (path) => JSON.parse(execFileSync('docker', ['compose', '-f', path, 'config', '--format', 'json'], {
  cwd: root,
  env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}));
const source = render('backend/compose.canary.coolify-raw.yml');
const copy = (value) => structuredClone(value);

test('raw Compose keeps PIT containers off Coolify proxy network', () => {
  assert.deepEqual(source, render('backend/compose.canary.yml'));
  assert.equal(validateCoolifyRawCanary(source, uuid), true);
});

test('Coolify raw parser list labels remain valid Compose', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'pit-coolify-raw-'));
  try {
    const raw = readFileSync(join(root, 'backend/compose.canary.coolify-raw.yml'), 'utf8');
    const generated = raw.replaceAll('      - traefik.enable=false', [
      '      - traefik.enable=false',
      '      - coolify.managed=true',
      `      - coolify.applicationUuid=${uuid}`,
      '      - coolify.type=application',
    ].join('\n'));
    const file = join(temporary, 'generated.yml');
    writeFileSync(file, generated, { mode: 0o600 });
    assert.equal(validateCoolifyRawCanary(render(file), uuid), true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('normal Coolify Service network injection fails closed', () => {
  const config = copy(source);
  config.networks[uuid] = { name: uuid, external: true };
  for (const service of Object.values(config.services)) service.networks[uuid] = null;
  assert.throws(() => validateCoolifyRawCanary(config, uuid));
});

test('a published port or Traefik router fails closed', () => {
  const port = copy(source);
  port.services['pit-api'].ports = [{ target: 8789, published: '8789' }];
  assert.throws(() => validateCoolifyRawCanary(port, uuid));
  const router = copy(source);
  router.services['pit-api'].labels['traefik.http.routers.pit.rule'] = 'Host(`pit.example`)';
  assert.throws(() => validateCoolifyRawCanary(router, uuid));
});
