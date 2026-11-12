#!/usr/bin/env bash
set -euo pipefail
exec node --input-type=module - "$@" <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseEnv } from 'node:util';

// This release checks existing records only: no inference or settlement POSTs.
const [manifest, phase] = process.argv.slice(2);
const state = JSON.parse(readFileSync(manifest, 'utf8'));
assert.equal(state.service, 'new-api');
const directory = dirname(manifest);
const routes = JSON.parse(readFileSync(`${state.runtime}/routes.json`, 'utf8'));
const inspect = (id) => JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
const address = (id) => inspect(id).NetworkSettings.Networks[state.network].IPAddress;
const base = phase === 'candidate'
  ? `http://${address(state.candidateContainer)}:3000`
  : 'https://console.acucompute.com';
const save = (name, data) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(data, null, 2), { mode: 0o600 });
const db = (sql) => execFileSync('docker', ['exec', '-i', 'acu-router-alpha-postgres-newapi-1', 'sh', '-c', 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'], { input: `BEGIN READ ONLY;\n${sql};\nROLLBACK;`, encoding: 'utf8', timeout: 20000 }).trim().split('\n').filter((line) => !['BEGIN', 'ROLLBACK'].includes(line)).join('\n');
async function json(path, token) {
  const response = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200, `HTTP failure: ${path.split('?')[0]}`);
  const body = await response.json();
  assert.equal(body.success, true, `Business failure: ${path.split('?')[0]}`);
  return body;
}
const status = await json('/api/status');
let auth;
if (phase === 'candidate') {
  const env = parseEnv(readFileSync(state.env, 'utf8'));
  const runtimeEnv = Object.fromEntries(inspect(routes['new-api'].container).Config.Env.map((item) => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
  const dsn = new URL(runtimeEnv.SQL_DSN);
  dsn.hostname = address('acu-router-alpha-postgres-newapi-1');
  const userID = db(`SELECT id FROM users WHERE username='${env.NEW_API_ROOT_USERNAME.replaceAll("'", "''")}' AND status=1 AND deleted_at IS NULL`);
  assert.match(userID, /^\d+$/);
  auth = JSON.parse(execFileSync(`${directory}/session-helper`, [], { env: { ...process.env, SESSION_SECRET: runtimeEnv.SESSION_SECRET, ACCEPTANCE_DATABASE_URL: dsn.toString(), ACCEPTANCE_USER_ID: userID }, encoding: 'utf8', timeout: 120000 }));
  save('auth.private', auth);
} else {
  auth = JSON.parse(readFileSync(`${directory}/auth.private.json`, 'utf8'));
}
const token = auth.access_token;
assert.equal((await json('/api/user/self', token)).data.id, auth.user.id);
const requestID = '202611120357429280171988268d9d6nKHxivqO';
const params = new URLSearchParams({ request_id: requestID, start_timestamp: '0', end_timestamp: '0', p: '1', page_size: '20' });
const list = (await json(`/api/log/?${params}`, token)).data;
assert.equal(list.total, 1);
assert.equal(list.items.length, 1);
const log = list.items[0];
assert.equal(log.request_id, requestID);
const other = typeof log.other === 'string' ? JSON.parse(log.other) : log.other;
assert.equal(other.user_charge_cny, '0.0028740000');
const breakdown = other.acu_cost_breakdown ?? other.admin_info?.acu_cost_breakdown;
assert.equal(breakdown.retail_input_accounting_mode, 'includes_cached');
assert.equal(breakdown.retail_model_multiplier, '0.50');
assert.equal(breakdown.retail_reference_currency, 'CNY');
assert.equal(log.prompt_tokens, 90);
assert.equal(log.completion_tokens, 51);
const stat = (await json(`/api/log/stat?${params}`, token)).data;
assert.match(stat.user_charge_cny, /^0\.0028740*$/);
assert.equal(stat.quota, log.quota);
assert.equal(stat.exact_charge_count, 1);
assert.equal(stat.legacy_charge_count, 0);
const miss = new URLSearchParams(params);
miss.set('request_id', 'static-ui-acceptance-nonexistent-request');
assert.equal((await json(`/api/log/?${miss}`, token)).data.total, 0);
assert.equal((await json(`/api/log/stat?${miss}`, token)).data.user_charge_cny, '0');
const upstream = new URLSearchParams(params);
upstream.delete('request_id');
upstream.set('upstream_request_id', 'static-ui-acceptance-nonexistent-upstream');
assert.equal((await json(`/api/log/?${upstream}`, token)).data.total, 0);
assert.equal((await json(`/api/log/stat?${upstream}`, token)).data.user_charge_cny, '0');
const digest = createHash('sha256').update(JSON.stringify({ quota: log.quota, prompt: log.prompt_tokens, completion: log.completion_tokens, other: log.other })).digest('hex');
if (phase !== 'candidate') assert.equal(digest, JSON.parse(readFileSync(`${directory}/static-ui-candidate.json`, 'utf8')).existingBillDigest);
const report = (await json('/api/option/acu-retail-pricing?days=7', token)).data;
assert.equal(report.active.version, 'acu-static-20261112-v1');
assert.equal(report.active.models.length, 37);
const priceBookDigest = createHash('sha256').update(JSON.stringify(report.active)).digest('hex');
if (phase !== 'candidate') assert.equal(priceBookDigest, JSON.parse(readFileSync(`${directory}/static-ui-candidate.json`, 'utf8')).priceBookDigest);
assert.equal(report.economics.costScope, 'recorded_cost_excludes_fixed_infrastructure_and_payment_fees');
assert.ok(report.economics.models.every((row) => typeof row.reportingCoverage === 'number'));
const ledgers = db(`SELECT count(*) FROM acu_usage_finalizes WHERE logical_request_id='${other.acu_logical_request_id.replaceAll("'", "''")}' AND status='finalized'`);
assert.equal(ledgers, '1');
save(`static-ui-${phase}`, { phase, revision: state.revision, status: true, requestID, exactCny: stat.user_charge_cny, quota: stat.quota, exactCount: stat.exact_charge_count, legacyCount: stat.legacy_charge_count, cacheMode: breakdown.retail_input_accounting_mode, billedUncachedInput: 26, existingBillDigest: digest, priceBookDigest, finalizedLedgers: 1, reportModels: report.active.models.length, reportingCoverageAvailable: true, paidRequestsCreated: 0, statusOK: status.success });
if (phase === 'public') {
  const logout = await fetch(`${base}/api/user/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: new URL(base).origin }, signal: AbortSignal.timeout(30000) });
  assert.equal(logout.status, 200);
  assert.equal((await logout.json()).success, true);
  const rejected = await fetch(`${base}/api/user/self`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  assert.equal(rejected.status, 401);
  const { unlinkSync } = await import('node:fs');
  unlinkSync(`${directory}/auth.private.json`);
  save('static-ui-session-cleanup', { revoked: true, subsequentStatus: 401, privateFileRemoved: true });
}
console.log(JSON.stringify({ phase, exactCny: stat.user_charge_cny, finalizedLedgers: 1, paidRequestsCreated: 0, result: 'passed' }));
JS
