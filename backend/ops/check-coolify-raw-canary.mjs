// Validate the exact Docker Compose render before a Coolify raw-Compose canary starts.
// JSON on stdin can contain secrets; never echo it or include values in errors.
import { pathToFileURL } from 'node:url';
import { validateCanaryConfig } from './check-canary-config.mjs';

const fail = (code) => { throw new Error(code); };

export function validateCoolifyRawCanary(config, applicationUuid) {
  validateCanaryConfig(config);
  if (!/^[a-z0-9]{20,40}$/.test(applicationUuid ?? '')) fail('APPLICATION_UUID');
  const networks = Object.values(config.networks).map((network) => network.name);
  if (networks.includes(applicationUuid) || networks.includes('coolify')) fail('PROXY_NETWORK');
  for (const service of Object.values(config.services)) {
    if (Object.keys(service.networks ?? {}).some((name) => name === applicationUuid || name === 'default' || name === 'coolify')) {
      fail('PROXY_SERVICE_NETWORK');
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    validateCoolifyRawCanary(JSON.parse(input), process.argv[2]);
    console.log('PIT_COOLIFY_RAW_CANARY_CONFIG_PASS');
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'INVALID_CONFIGURATION';
    console.error('PIT_COOLIFY_RAW_CANARY_CONFIG_REJECTED', code);
    process.exitCode = 1;
  }
}
