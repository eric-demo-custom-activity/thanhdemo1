#!/usr/bin/env node
/*
 * Deployment-readiness verification.
 *
 * Runs automated checks against the repository and exits non-zero when any
 * required check fails. Checks that need an external tool (Docker) are reported
 * as SKIPPED when the tool is not installed; they are never reported as passed.
 *
 * This script proves repository readiness only. It does not prove Journey Builder
 * compatibility, public HTTPS reachability or any live gate. See README.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, status, detail = '') => results.push({ name, status, detail });
const check = (name, passed, detail = '') => record(name, passed ? 'PASS' : 'FAIL', detail);

const REQUIRED_FILES = [
  'server.js',
  'package.json',
  'public/index.html',
  'public/js/app.js',
  'public/css/main.css',
  'public/js/vendor/postmonger.js',
  'public/assets/icon.svg',
  'Dockerfile',
  '.dockerignore',
  '.env.example',
  'README.md',
  'README_VI.md',
];

// 1. Required files
for (const file of REQUIRED_FILES) {
  check(`file exists: ${file}`, existsSync(path.join(root, file)));
}

// 2. Package scripts
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
check('package.json declares verify:deployment', Boolean(pkg.scripts?.['verify:deployment']));
check('package.json declares test', Boolean(pkg.scripts?.test));

// 3. config.json and URLs (production-shaped configuration)
const { loadConfig } = await import('../server/config.js');
const { buildActivityConfig } = await import('../server/services/activity-config-builder.js');

const prodEnv = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://activity.example.test',
  SFMC_REQUIRE_JWT: 'true',
  SFMC_JWT_SECRET: 'verify-only-secret-value-0000000000000000',
  NOTIFICATION_HUB_MODE: 'http',
  NOTIFICATION_HUB_BASE_URL: 'https://nh.example.test',
  NOTIFICATION_HUB_API_KEY: 'verify-only-key',
  NOTIFICATION_HUB_SEND_PATH: '/send',
};
let prodConfig = null;
try {
  prodConfig = loadConfig(prodEnv);
  check('production configuration validates', true);
} catch (error) {
  check('production configuration validates', false, error.message);
}

if (prodConfig) {
  const definition = JSON.parse(JSON.stringify(buildActivityConfig(prodConfig)));
  const urls = [
    definition.arguments.execute.url,
    definition.configurationArguments.save.url,
    definition.configurationArguments.validate.url,
    definition.configurationArguments.publish.url,
    definition.configurationArguments.stop.url,
  ];
  check('config.json parses and has lifecycle URLs', urls.every((u) => typeof u === 'string'));
  check('config.json URLs use PUBLIC_BASE_URL over HTTPS', urls.every((u) => u.startsWith('https://activity.example.test/')));
  check('config.json contains no localhost or plain HTTP', !/localhost|127\.0\.0\.1|http:\/\//.test(JSON.stringify(definition)));
  check('config.json schema declares one key per object', definition.schema.arguments.execute.inArguments.every((e) => Object.keys(e).length === 1));
  check('config.json starts unconfigured', definition.metaData.isConfigured === false);
}

// 4. Production safety gates
const gateCases = [
  ['production refuses missing JWT secret', { ...prodEnv, SFMC_JWT_SECRET: '' }],
  ['production refuses plain HTTP base URL', { ...prodEnv, PUBLIC_BASE_URL: 'http://activity.example.test' }],
  ['production refuses simulation adapter', { ...prodEnv, NOTIFICATION_HUB_MODE: 'simulation' }],
  ['production refuses disabled JWT', { ...prodEnv, SFMC_REQUIRE_JWT: 'false' }],
];
for (const [name, env] of gateCases) {
  let refused = false;
  try {
    loadConfig(env);
  } catch {
    refused = true;
  }
  check(name, refused);
}

// 5. Lifecycle routes respond without 404 or 501 (in-process, development configuration)
const { createApp } = await import('../server/app.js');
const { createContainer } = await import('../server/container.js');
const request = (await import('supertest')).default;

const devConfig = loadConfig({ NODE_ENV: 'development' });
const container = await createContainer({ config: devConfig });
const app = createApp({ container, config: devConfig });

const lifecycle = [
  ['POST', '/journey/save'],
  ['POST', '/journey/validate'],
  ['POST', '/journey/publish'],
  ['POST', '/journey/stop'],
  ['POST', '/journey/execute'],
];
for (const [method, route] of lifecycle) {
  const res = await request(app)[method.toLowerCase()](route).send({});
  check(`${route} does not return 404 or 501`, res.status !== 404 && res.status !== 501, `status ${res.status}`);
}
const configRes = await request(app).get('/config.json');
check('GET /config.json returns 200', configRes.status === 200, `status ${configRes.status}`);
const rootRes = await request(app).get('/');
check('GET / returns the activity UI', rootRes.status === 200 && rootRes.text.includes('Notification Hub Custom Activity'));
const healthRes = await request(app).get('/health');
check('GET /health returns 200', healthRes.status === 200);

// 6. Quoted binding syntax and flat runtime arguments
const { buildEventBinding } = await import('../public/js/shared/event-binding-builder.js');
const binding = buildEventBinding({ eventDefinitionKey: 'ORDER_ENTRY_EVENT', bindingPath: 'CustomerId' });
check('bindings use quoted field names', binding.valid && binding.value === '{{Event.ORDER_ENTRY_EVENT."CustomerId"}}');

// 7. Secret patterns in source (test fixtures are excluded)
const SCAN_ROOTS = ['server', 'public', 'scripts'];
const SCAN_FILES = ['server.js', 'README.md', 'README_VI.md', '.env.example', 'Dockerfile'];
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(secret|token|password|api[_-]?key)\s*[:=]\s*['"][^'"\s]{16,}['"]/i,
];
const hits = [];
const scan = (file) => {
  const text = readFileSync(file, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) hits.push(path.relative(root, file));
  }
};
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'vendor' || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|mjs|html|css|json|md)$/.test(entry) && entry !== 'verify-deployment.mjs') scan(full);
  }
};
for (const dir of SCAN_ROOTS) walk(path.join(root, dir));
for (const file of SCAN_FILES) {
  if (existsSync(path.join(root, file))) scan(path.join(root, file));
}
check('no secret-like values in source or documentation', hits.length === 0, hits.join(', '));

const envExample = readFileSync(path.join(root, '.env.example'), 'utf8');
check('.env.example contains no filled secret values', !/^(SFMC_JWT_SECRET|NOTIFICATION_HUB_API_KEY)=.+$/m.test(envExample));
const dockerignore = readFileSync(path.join(root, '.dockerignore'), 'utf8');
check('.dockerignore excludes .env and node_modules', /^\.env$/m.test(dockerignore) && /^node_modules/m.test(dockerignore));

// 8. Tests
const testRun = spawnSync('npm', ['test', '--silent'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test' },
  encoding: 'utf8',
});
check('npm test passes', testRun.status === 0, testRun.status === 0 ? '' : `exit ${testRun.status}`);

// 9. Docker build (requires Docker; reported as SKIPPED otherwise)
const dockerProbe = spawnSync('docker', ['--version'], { encoding: 'utf8' });
if (dockerProbe.status === 0) {
  const build = spawnSync('docker', ['build', '-t', 'sfmc-custom-activity:verify', '.'], { cwd: root, encoding: 'utf8' });
  check('docker build succeeds', build.status === 0, build.status === 0 ? '' : `exit ${build.status}`);
} else {
  record('docker build succeeds', 'SKIPPED', 'docker is not installed in this environment');
}

// Report
let failed = 0;
for (const result of results) {
  if (result.status === 'FAIL') failed += 1;
  const detail = result.detail ? `  (${result.detail})` : '';
  console.log(`${result.status.padEnd(7)} ${result.name}${detail}`);
}
const passed = results.filter((r) => r.status === 'PASS').length;
const skipped = results.filter((r) => r.status === 'SKIPPED').length;
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);
