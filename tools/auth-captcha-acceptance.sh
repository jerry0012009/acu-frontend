#!/usr/bin/env bash
set -euo pipefail
exec node --input-type=module - "$@" <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const [manifest, phase] = process.argv.slice(2);
const state = JSON.parse(readFileSync(manifest, 'utf8'));
assert.equal(state.service, 'new-api');
const inspect = (id) => JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
const candidate = inspect(state.candidateContainer);
const base = phase === 'candidate' ? `http://${candidate.NetworkSettings.Networks[state.network].IPAddress}:3000` : 'https://console.acucompute.com';
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  return { response, body: await response.json() };
}
const status = await request('/api/status');
assert.equal(status.body.success, true);
assert.equal(status.body.data.auth_captcha, 'local-image');
assert.equal(status.body.data.email_verification, true);
for (const purpose of ['login','register-email','reset-email']) {
  const { response, body } = await request(`/api/auth/captcha?purpose=${purpose}`);
  assert.equal(body.success, true);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(body.data.id, /^[\da-f-]{36}$/);
  const image = Buffer.from(body.data.image.split(',')[1], 'base64');
  assert.equal(image.subarray(1,4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16),180);
  assert.equal(image.readUInt32BE(20),60);
}
for (const path of ['/api/verification?email=auth-acceptance@example.invalid','/api/reset_password?email=auth-acceptance@example.invalid']) {
  const { body } = await request(path);
  assert.equal(body.success,false);
  assert.equal(body.code,'CAPTCHA_REQUIRED');
}
const username = `auth-accept-${state.id ?? state.releaseId ?? state.revision.slice(0,12)}-${phase}`.slice(0,90);
const responses=[];
for(let i=0;i<4;i++) {
  const {body}=await request('/api/user/login',{username,password:'invalid-acceptance-password'});
  assert.equal(body.success,false);
  if(i<2) assert.notEqual(body.code,'CAPTCHA_REQUIRED');
  else assert.equal(body.code,'CAPTCHA_REQUIRED');
  responses.push(body.code ?? 'INVALID_CREDENTIALS');
}
writeFileSync(`${dirname(manifest)}/auth-captcha-${phase}.json`,JSON.stringify({phase,revision:state.revision,status:true,localImagePurposes:3,missingCaptchaRejected:true,loginResults:responses,paidRequestsCreated:0,usersCreated:0,emailsSent:0},null,2),{mode:0o600});
console.log(JSON.stringify({phase,result:'passed',loginDefaultNoCaptcha:true,loginFailureEscalation:true,missingEmailCaptchaRejected:true,paidRequestsCreated:0,usersCreated:0,emailsSent:0}));
JS
