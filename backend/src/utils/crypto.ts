import { createHash } from 'crypto';

/**
 * Compute a SHA-256 hash of the provided buffer.
 * Returns a Buffer (raw bytes) suitable for storage in the DB.
 */
export function computeSha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/**
 * Compute SHA-256 of a string and return hex string.
 */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Build a new audit hash chain entry.
 * currentHash = SHA256(prevHash + currentEventJSON)
 */
export function buildChainHash(prevHash: string, currentEventData: object): string {
  const payload = prevHash + JSON.stringify(currentEventData);
  return sha256Hex(payload);
}
