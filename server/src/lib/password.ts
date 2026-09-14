// Password hashing for the Workers runtime.
//
// bcrypt is a native Node addon and does not run on Cloudflare Workers at all,
// so this uses PBKDF2-HMAC-SHA256 through the Web Crypto API, which is
// available in the runtime and is FIPS-approved.
//
// CPU NOTE: PBKDF2 at OWASP's recommended iteration count costs far more than
// the 10ms CPU budget of the Workers *Free* plan, so a deployed login needs
// Workers Paid (30s default CPU) or an SSO front door such as Cloudflare
// Access. Local `wrangler dev` is not CPU limited, so development and demos
// work on either plan. The count is configurable rather than silently lowered:
// weakening it is a security decision that should be made deliberately.

const DEFAULT_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/**
 * Returns a self-describing hash: `pbkdf2$<iterations>$<salt>$<hash>`.
 * Storing the iteration count alongside the hash means the cost can be raised
 * later without invalidating existing passwords.
 */
export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Compares two byte arrays in constant time to avoid leaking a match prefix. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await deriveBits(password, salt, iterations);
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
