// Password hashing for Cloudflare Workers.
//
// The Workers runtime supports node:crypto's native scrypt implementation.
// Scrypt is intentionally expensive in both CPU and memory, which makes stolen
// database hashes substantially harder to crack than a fast general-purpose
// digest. Every password receives its own cryptographically random salt.

import { scrypt as nodeScrypt } from "node:crypto";

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function deriveKey(
  password: string,
  salt: Uint8Array,
  n = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, KEY_BYTES, { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(new Uint8Array(key));
    });
  });
}

/** Returns a self-describing hash: `scrypt$N$r$p$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Compares two byte arrays without revealing the first mismatched byte. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;

  try {
    const salt = fromBase64(parts[4]);
    const expected = fromBase64(parts[5]);
    const actual = await deriveKey(password, salt, n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Cryptographically random temporary password for newly provisioned accounts. */
export function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return toBase64(bytes).replace(/[+/=]/g, "").slice(0, 16);
}
