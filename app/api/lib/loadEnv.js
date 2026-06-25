import dotenv from "dotenv";
import fs from "fs";
import path from "path";

let loaded = false;

function parseLooseEnvFile(contents) {
  const out = {};
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;

    let key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (key.startsWith('export ')) {
      key = key.slice('export '.length).trim();
    }

    // Strip optional wrapping quotes
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    // Do not treat # as a comment delimiter; passwords often contain it.
    out[key] = value;
  }

  return out;
}

function tryLoad(dotenvPath) {
  try {
    if (!fs.existsSync(dotenvPath)) return false;
    dotenv.config({ path: dotenvPath, override: false });

    // Also support loose formatting like `KEY = value` (dotenv treats that as `KEY `).
    const loose = parseLooseEnvFile(fs.readFileSync(dotenvPath, 'utf8'));
    for (const [k, v] of Object.entries(loose)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
    return true;
  } catch {
    return false;
  }
}

export function loadServerEnvOnce() {
  if (loaded) return;

  // Next.js loads root .env* automatically, but many projects mistakenly place
  // env files under app/api. We support both to make local dev reliable.
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    path.join(cwd, "app", "api", ".env.local"),
    path.join(cwd, "app", "api", ".env"),
  ];

  for (const candidate of candidates) {
    if (tryLoad(candidate)) {
      // keep going in case multiple files exist; dotenv won't override by default
    }
  }

  loaded = true;
}
