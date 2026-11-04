#!/usr/bin/env node
/**
 * Rules Studio setup helper. Generates the two secrets the Studio needs and prints them as env lines.
 *
 *   node scripts/rules-studio-setup.mjs                 print production-style env lines (copy into your secret store)
 *   node scripts/rules-studio-setup.mjs --rehearsal     write apps/api/.env.rehearsal (git-ignored) for a LOCAL rehearsal
 *
 * Nothing here is ever committed. In production, keep the signing key in your secret manager and the
 * recovery copy offline with the named custodians; losing it makes old versions unverifiable.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rehearsal = process.argv.includes('--rehearsal');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyId = `rules-${new Date().toISOString().slice(0, 7)}`;
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim().replace(/\n/g, '\\n');
const pub = publicKey.export({ type: 'spki', format: 'pem' }).trim();
const totp = randomBytes(32).toString('base64');

if (!rehearsal) {
  console.log(`# Rules Studio secrets - store in your secret manager, NOT in git
RULES_SIGNING_KEY_ID=${keyId}
RULES_SIGNING_PRIVATE_KEY="${priv}"
RULES_TOTP_ENC_KEY=${totp}

# Public half (safe to share; keep it with the offline recovery copy so versions stay verifiable after a rotation)
# ${pub.replace(/\n/g, '\n# ')}

# Still needed from the owner (see docs/rules-studio/README.md):
# RULES_OFFSITE_AZURE_CONNECTION_STRING / RULES_OFFSITE_CONTAINER   (different subscription, immutability policy)
# RULES_ALARM_WEBHOOK_URL, RULES_HEARTBEAT_URL, RULES_MONGO_URI, BUILD_ID`);
  process.exit(0);
}

const file = resolve(root, 'apps/api/.env.rehearsal');
if (existsSync(file)) {
  console.error(`${file} already exists; delete it first if you want fresh keys (old rehearsal versions would stop verifying).`);
  process.exit(1);
}
const dir = resolve(root, '.rules-rehearsal-backups');
mkdirSync(dir, { recursive: true });
writeFileSync(file, `# LOCAL REHEARSAL ONLY - generated ${new Date().toISOString()} - git-ignored
RULES_REHEARSAL=true
RULES_SIGNING_KEY_ID=${keyId}
RULES_SIGNING_PRIVATE_KEY="${priv}"
RULES_TOTP_ENC_KEY=${totp}
RULES_OFFSITE_LOCAL_DIR=${dir.replace(/\\/g, '/')}
BUILD_ID=rehearsal-local
`);
console.log(`Wrote ${file}\nBackups (REHEARSAL, not off-site) go to ${dir}\nStart the API with RULES_ENV_FILE=${file.replace(/\\/g, '/')}`);
