/**
 * ECDSA Digital Signature Service
 * ================================
 * Uses Node.js built-in `crypto` module with ECDSA P-256 (secp256r1).
 *
 * Key pair is generated once on first startup and stored in:
 *   backend/.keys/private.pem   (keep secret — would be in HSM in production)
 *   backend/.keys/public.pem    (can be distributed for verification)
 *
 * Every generated PDF is signed. The base64 signature is embedded in the
 * PDF footer and stored in the Reports record.
 *
 * Production note: Replace file-based keys with HSM-backed or CA-signed
 * certificates (e.g., AWS CloudHSM, Azure Key Vault).
 */

import { createSign, createVerify, generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const KEYS_DIR = path.resolve(__dirname, '..', '..', '.keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

/**
 * Generates an ECDSA P-256 key pair if one does not already exist.
 * Should be called once at application startup.
 */
export function generateKeyPairIfNotExists(): void {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    console.log('🔑 ECDSA keys found. Using existing key pair.');
    return;
  }

  mkdirSync(KEYS_DIR, { recursive: true });

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 }); // owner read-only
  writeFileSync(PUBLIC_KEY_PATH, publicKey);

  console.log('🔑 ECDSA P-256 key pair generated and saved to .keys/');
}

/**
 * Signs a buffer using the ECDSA P-256 private key.
 * Returns a base64-encoded DER signature.
 */
export function signBuffer(buffer: Buffer): string {
  const privateKey = readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const signer = createSign('SHA256');
  signer.update(buffer);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

/**
 * Verifies an ECDSA signature against a buffer.
 * @param buffer    - The original data (e.g., PDF bytes)
 * @param signature - The base64-encoded DER signature produced by signBuffer()
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(buffer: Buffer, signature: string): boolean {
  try {
    const publicKey = readFileSync(PUBLIC_KEY_PATH, 'utf8');
    const verifier = createVerify('SHA256');
    verifier.update(buffer);
    verifier.end();
    return verifier.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Returns the PEM-encoded public key for distribution.
 */
export function getPublicKeyPem(): string {
  return readFileSync(PUBLIC_KEY_PATH, 'utf8');
}
