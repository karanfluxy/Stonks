import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomUUID } from 'crypto';
import { loadServerEnvOnce } from './loadEnv';

loadServerEnvOnce();

const encoder = new TextEncoder();

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    const err = new Error(`Missing required env var: ${name}`);
    // @ts-ignore
    err.statusCode = 500;
    throw err;
  }
  return value;
}

function getAccessSecret() {
  return encoder.encode(getEnv('JWT_ACCESS_SECRET'));
}

function getRefreshSecret() {
  return encoder.encode(getEnv('JWT_REFRESH_SECRET'));
}

const ISSUER = 'stonks';
const AUDIENCE = 'stonks-web';

export const ACCESS_TOKEN_COOKIE = 'stonks_access';
export const REFRESH_TOKEN_COOKIE = 'stonks_refresh';

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60; // 10 min
export const REFRESH_TOKEN_TTL_SECONDS_DEFAULT = 7 * 24 * 60 * 60; // 7 days
export const REFRESH_TOKEN_TTL_SECONDS_REMEMBER_ME = 30 * 24 * 60 * 60; // 30 days

export function createRefreshTokenId() {
  return randomUUID();
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export async function signAccessToken(payload) {
  // payload: { sub: string, email?: string, name?: string }
  return new SignJWT({ email: payload.email ?? null, name: payload.name ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(String(payload.sub))
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getAccessSecret());
}

export async function signRefreshToken(payload, ttlSeconds) {
  const ttl = ttlSeconds ?? REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(String(payload.sub))
    .setJti(String(payload.jti))
    .setExpirationTime(`${ttl}s`)
    .sign(getRefreshSecret());
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, getAccessSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
  };
}

export async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, getRefreshSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (payload.type !== 'refresh' || !payload.jti) {
    const err = new Error('Invalid refresh token');
    // @ts-ignore
    err.statusCode = 401;
    throw err;
  }

  return {
    sub: payload.sub,
    exp: payload.exp,
    jti: payload.jti,
  };
}

