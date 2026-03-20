import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const defaultEnvFile = path.join(rootDir, '.env.release.local');
const argv = process.argv.slice(2);
const isCheckOnly = argv.includes('--check');
const isDirTarget = argv.includes('--dir');
const targetArch = readOptionValue('--arch');
const target = isDirTarget ? 'dir' : 'dmg';

if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (process.platform !== 'darwin') {
  fail('`release:mac` 只能在 macOS 上执行。');
}

const fileEnv = existsSync(defaultEnvFile)
  ? parseEnvFile(readFileSync(defaultEnvFile, 'utf8'))
  : {};
const releaseEnv = {
  ...process.env,
  ...fileEnv,
};

const signingConfigured = Boolean(configuredValue(releaseEnv.CSC_NAME) || configuredValue(releaseEnv.CSC_LINK));
const notarizationMode = getNotarizationMode(releaseEnv);

if (!signingConfigured) {
  fail([
    '没有找到正式签名配置。',
    '请在 `.env.release.local` 里设置 `CSC_NAME`，或设置 `CSC_LINK` + `CSC_KEY_PASSWORD`。',
    '可以先复制 `.env.release.example` 为 `.env.release.local` 再填写。',
  ].join('\n'));
}

if (!configuredValue(releaseEnv.CSC_NAME) && configuredValue(releaseEnv.CSC_LINK) && !configuredValue(releaseEnv.CSC_KEY_PASSWORD)) {
  fail('检测到 `CSC_LINK`，但没有配置 `CSC_KEY_PASSWORD`。');
}

if (!notarizationMode) {
  fail([
    '没有找到 notarization 配置。',
    '请至少配置下面三组中的一组：',
    '1. `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`',
    '2. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`',
    '3. `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`',
  ].join('\n'));
}

const archArgs = normalizeArchArgs(targetArch);
const builderArgs = ['electron-builder', '--mac', target, ...archArgs];

console.log('Release configuration is ready.');
console.log(`Signing: ${trimmed(releaseEnv.CSC_NAME) ? 'CSC_NAME' : 'CSC_LINK'}`);
console.log(`Notarization: ${notarizationMode}`);
console.log(`Target: mac ${target}${archArgs.length > 0 ? ` (${archArgs.join(' ')})` : ''}`);
console.log(`Env file: ${existsSync(defaultEnvFile) ? '.env.release.local' : 'process env only'}`);

if (isCheckOnly) {
  process.exit(0);
}

runCommand('npm', ['run', 'build'], releaseEnv);
runCommand('npm', ['run', 'build:icon'], releaseEnv);
runCommand(getNpxCommand(), builderArgs, releaseEnv);

function runCommand(command, args, env) {
  execFileSync(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });
}

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function normalizeArchArgs(value) {
  const normalized = trimmed(value);
  if (!normalized) {
    return [];
  }

  if (!['arm64', 'x64', 'universal'].includes(normalized)) {
    fail('`--arch` 只支持 `arm64`、`x64` 或 `universal`。');
  }

  return [`--${normalized}`];
}

function getNotarizationMode(env) {
  if (configuredValue(env.APPLE_API_KEY) && configuredValue(env.APPLE_API_KEY_ID) && configuredValue(env.APPLE_API_ISSUER)) {
    return 'App Store Connect API Key';
  }

  if (configuredValue(env.APPLE_ID) && configuredValue(env.APPLE_APP_SPECIFIC_PASSWORD) && configuredValue(env.APPLE_TEAM_ID)) {
    return 'Apple ID + app-specific password';
  }

  if (configuredValue(env.APPLE_KEYCHAIN) && configuredValue(env.APPLE_KEYCHAIN_PROFILE)) {
    return 'notarytool keychain profile';
  }

  return '';
}

function readOptionValue(name) {
  const direct = argv.find((entry) => entry.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = argv.findIndex((entry) => entry === name);
  if (index === -1) {
    return '';
  }

  return argv[index + 1] || '';
}

function parseEnvFile(source) {
  const env = {};

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    env[key] = stripWrappingQuotes(value);
  }

  return env;
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function configuredValue(value) {
  const normalized = trimmed(value);
  return Boolean(normalized) && !isPlaceholderValue(normalized);
}

function isPlaceholderValue(value) {
  const placeholderPatterns = [
    /^Developer ID Application: Your Name \(TEAMID.*\)$/u,
    /^your-apple-id@example\.com$/u,
    /^your-p12-password$/u,
    /^TEAMID\d*$/u,
    /^ABC1234567$/u,
    /^01234567-89ab-cdef-0123-456789abcdef$/u,
    /^xxxx-xxxx-xxxx-xxxx$/u,
    /^\/absolute\/path\/to\//u,
    /^AuthKey_ABC1234567\.p8$/u,
  ];

  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`
Usage:
  npm run release:mac
  npm run release:mac -- --check
  npm run release:mac -- --dir
  npm run release:mac -- --arch arm64
  npm run release:mac -- --arch universal

Expected local secrets file:
  .env.release.local
  `.trim());
}
