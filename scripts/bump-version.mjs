#!/usr/bin/env node
// Set the app version everywhere it lives, for a new store build.
//
//   node scripts/bump-version.mjs 1.0.28
//
// Updates app.config.js (version + OTA runtime version), the iOS Info.plist,
// the Android build.gradle, and the native OTA config. Build numbers are not
// touched: EAS increments those itself.
//
// Bump the version whenever you make a new store build. Over-the-air updates
// (`eas update`) only reach builds with the same version, so a JS update can
// never land on a binary with different native code.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch>   e.g. 1.0.28');
  process.exit(1);
}

const replaceOnce = (file, pattern, replacement) => {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) {
    console.error(`Could not find the version in ${file}; nothing was changed there.`);
    process.exit(1);
  }
  writeFileSync(path, before.replace(pattern, replacement));
  console.log(`  ${file}`);
};

console.log(`Setting version ${version}:`);
replaceOnce('app.config.js', /const VERSION = "[^"]+";/, `const VERSION = "${version}";`);
replaceOnce(
  'ios/EventSwipe/Info.plist',
  /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
  `$1${version}$2`
);
replaceOnce('android/app/build.gradle', /versionName "[^"]+"/, `versionName "${version}"`);

// Writes the runtime version into ios/.../Expo.plist and android strings.xml
for (const platform of ['ios', 'android']) {
  execSync(`npx expo-updates configuration:syncnative --platform ${platform} --workflow generic`, {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`  native OTA config (${platform})`);
}

console.log(`\nDone. Commit, then build:  eas build --platform all --profile production --auto-submit`);
