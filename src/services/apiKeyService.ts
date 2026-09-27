import crypto from 'crypto';

// SDK keys are 256-bit random secrets, so a plain SHA-256 is enough to store
// them safely; the raw key is shown once at creation.
export function generateApiKey() {
  const key = `sk-${crypto.randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 10) };
}

export function hashApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}
