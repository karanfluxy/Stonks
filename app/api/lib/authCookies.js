import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
} from './jwt';

export function buildAuthCookies({ accessToken, refreshToken, refreshMaxAgeSeconds }) {
  const secure = process.env.NODE_ENV === 'production';

  const common = {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };

  const access = {
    name: ACCESS_TOKEN_COOKIE,
    value: accessToken,
    ...common,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  };

  const refresh = {
    name: REFRESH_TOKEN_COOKIE,
    value: refreshToken,
    ...common,
    maxAge: refreshMaxAgeSeconds,
  };

  return { access, refresh };
}

export function clearAuthCookies() {
  const secure = process.env.NODE_ENV === 'production';

  const common = {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  };

  return {
    access: { name: ACCESS_TOKEN_COOKIE, value: '', ...common },
    refresh: { name: REFRESH_TOKEN_COOKIE, value: '', ...common },
  };
}
