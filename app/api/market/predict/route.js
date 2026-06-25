import { NextResponse } from 'next/server';
import path from 'path';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

const IS_VERCEL = process.env.VERCEL === '1';
const FORCE_PYTHON = process.env.PREDICT_FORCE_PYTHON === '1';

function runPredictScript(closes) {
  return new Promise((resolve, reject) => {
    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'scripts', 'predict_price.py');
    const pythonBin = process.env.PYTHON_BIN || 'python';
    const payload = JSON.stringify(closes);

    const child = spawn(pythonBin, [scriptPath, payload], {
      cwd: projectRoot,
      env: {
        ...process.env,
      },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Prediction timed out'));
    }, 20000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `Predict script failed with code ${code}`;
        reject(new Error(message));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON from prediction script'));
      }
    });
  });
}

function heuristicPredict(closes) {
  const window = closes.slice(-50);
  const last = Number(window[window.length - 1] || 0);
  if (!Number.isFinite(last) || last <= 0) return null;

  const sma = (arr) => arr.reduce((s, n) => s + Number(n || 0), 0) / arr.length;
  const sma5 = sma(window.slice(-5));
  const sma10 = sma(window.slice(-10));
  const momentum5 = last - Number(window[window.length - 6] || last);

  // Conservative blend so fallback is stable in serverless environments.
  const drift = ((sma5 - sma10) * 0.55) + (momentum5 * 0.25);
  const predicted = last + drift;
  return Number(predicted.toFixed(4));
}

export async function POST(req) {
  try {
    const body = await req.json();
    const closes = Array.isArray(body?.closes)
      ? body.closes.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];

    if (closes.length < 50) {
      return NextResponse.json({ error: 'Need at least 50 close values' }, { status: 400 });
    }

    let predicted = null;
    let source = 'model.pth';

    if (!IS_VERCEL || FORCE_PYTHON) {
      try {
        const result = await runPredictScript(closes.slice(-50));
        predicted = Number(result?.predicted);
      } catch {
        predicted = null;
      }
    }

    if (!Number.isFinite(predicted)) {
      predicted = heuristicPredict(closes.slice(-50));
      source = 'heuristic-fallback';
    }

    if (!Number.isFinite(predicted)) {
      return NextResponse.json({ error: 'Model returned invalid prediction' }, { status: 500 });
    }

    return NextResponse.json(
      {
        predicted,
        meta: {
          source,
          window: 50,
          requestedAt: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prediction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
