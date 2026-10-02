#!/usr/bin/env node
// Control the in-app "update available" prompt.
//
//   node scripts/update-banner.mjs show 1.0.28            banner for everyone below 1.0.28
//   node scripts/update-banner.mjs require 1.0.28         blocking screen for everyone below 1.0.28
//   node scripts/update-banner.mjs off                    turn both off
//   node scripts/update-banner.mjs status                 show the current settings
//
// Options:
//   --platform ios|android|all   default: all (use this when one store approves first)
//   --message "text"             shown instead of the default wording (not translated);
//                                --message "" clears it
//
// Tapping Update opens the App Store on iPhone and Google Play on Android.
// People already on that version or newer never see the prompt. Only builds
// that include the banner (1.0.27 and later) can show it.
//
// Uses your gcloud login (the same account as `firebase deploy`); no key files.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'eventswipe-6a924';
const DOC = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/config/appUpdate`;
const PLATFORMS = ['ios', 'android'];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// ---- arguments ----
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value ?? '';
};
const platformOption = option('platform') ?? 'all';
const message = option('message');
const [command, version] = args;

const usage = 'Usage: node scripts/update-banner.mjs show|require <version> | off | status  [--platform ios|android|all] [--message "text"]';
if (!['show', 'require', 'off', 'status'].includes(command)) fail(usage);
if (!['ios', 'android', 'all'].includes(platformOption)) fail('--platform must be ios, android or all');
if ((command === 'show' || command === 'require') && !/^\d+\.\d+\.\d+$/.test(version || '')) {
  fail(`"${command}" needs a version like 1.0.28\n${usage}`);
}
const targets = platformOption === 'all' ? PLATFORMS : [platformOption];

// ---- Firestore over REST, authorised by gcloud ----
const gcloud = () => {
  const local = join(homedir(), 'google-cloud-sdk', 'bin', 'gcloud');
  return existsSync(local) ? local : 'gcloud';
};
let token;
try {
  token = execSync(`"${gcloud()}" auth print-access-token`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
} catch {
  fail('Could not get a Google access token. Run `gcloud auth login` and try again.');
}
const request = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': PROJECT,
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 404) return null;
  const body = await response.json();
  if (!response.ok) fail(`Firestore error: ${body.error?.message || response.status}`);
  return body;
};

// Firestore's REST value format <-> plain objects (only strings and maps are used)
const decode = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    value.mapValue ? decode(value.mapValue.fields) : value.stringValue ?? value.timestampValue ?? null,
  ]));
const encode = (object) => ({
  fields: Object.fromEntries(Object.entries(object).map(([key, value]) => [
    key,
    value && typeof value === 'object' ? { mapValue: encode(value) } : { stringValue: String(value) },
  ])),
});

const read = async () => decode((await request(DOC))?.fields);

const describe = (config) => {
  for (const platform of PLATFORMS) {
    const { latestVersion, minVersion } = config[platform] || {};
    const parts = [];
    if (minVersion) parts.push(`REQUIRED below ${minVersion}`);
    if (latestVersion) parts.push(`banner below ${latestVersion}`);
    console.log(`  ${platform.padEnd(8)} ${parts.length ? parts.join(', ') : 'off'}`);
  }
  console.log(`  message  ${config.message ? `"${config.message}"` : '(default wording)'}`);
};

// ---- run ----
const config = await read();

if (command === 'status') {
  console.log('Update prompt:');
  describe(config);
  process.exit(0);
}

for (const platform of targets) {
  if (command === 'off') {
    delete config[platform];
  } else if (command === 'show') {
    // A banner replaces any earlier "required" setting for this platform
    config[platform] = { latestVersion: version };
  } else {
    config[platform] = { latestVersion: version, minVersion: version };
  }
}
if (message !== undefined) {
  if (message) config.message = message;
  else delete config.message;
}
// With everything off, a leftover custom message would be confusing later
if (!PLATFORMS.some((platform) => config[platform])) delete config.message;
delete config.updatedAt;

// PATCH without an update mask replaces the whole document
await request(DOC, {
  method: 'PATCH',
  body: JSON.stringify(encode({ ...config, updatedAt: new Date().toISOString() })),
});

console.log('Update prompt is now:');
describe(await read());
if (command === 'require') {
  console.log('\nNote: "require" blocks the app for everyone below that version until they update.');
}
