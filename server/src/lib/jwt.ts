// JWT signing/verification using `jose`, which is built on Web Crypto and runs
// natively on Workers (the old `jsonwebtoken` library depends on Node's crypto
// module and does not).

import { SignJWT, jwtVerify } from "jose";

export type Role = "STUDENT" | "SUPERVISOR" | "ADMIN";

export interface AccessTokenPayload {
  sub: number;
  role: Role;
  email: string;
}

const encoder = new TextEncoder();

function secretKey(secret: string): Uint8Array {
  return encoder.encode(secret);
}

export async function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresIn: string
): Promise<string> {
  return new SignJWT({ role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function signRefreshToken(
  userId: number,
  secret: string,
  expiresIn: string
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return {
    sub: Number(payload.sub),
    role: payload.role as Role,
    email: payload.email as string,
  };
}

export async function verifyRefreshToken(token: string, secret: string): Promise<number> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return Number(payload.sub);
}

/** SHA-256 hex digest, used to store refresh tokens hashed rather than raw. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
