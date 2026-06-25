import { NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import getConnection from '../../lib/mysql';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '../../lib/jwt';
import { getGeminiApiKey, upsertPortfolioSnapshotToChroma, ensureAiEnv } from '../../lib/chromaMemory';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

const ratingSuggestionSchema = z.object({
  symbol: z.string(),
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  reason: z.string(),
});

const ratingSchema = z.object({
  score: z.number(),
  summary: z.string(),
  suggestions: z.array(ratingSuggestionSchema),
  risks: z.array(z.string()).default([]),
});

function round2(v) {
  return Math.round(v * 100) / 100;
}

async function getAuthenticatedUserId(req) {
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;
  try {
    const decoded = await verifyAccessToken(accessToken);
    return decoded?.sub ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { cache: 'no-store', ...options });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function parseGeminiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  function extractFirstJsonObject(input) {
    const source = String(input || '');
    for (let start = 0; start < source.length; start++) {
      if (source[start] !== '{') continue;

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === '{') depth++;
        if (ch === '}') depth--;

        if (depth === 0) {
          const candidate = source.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }

    return null;
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const embeddedObj = extractFirstJsonObject(raw);
  if (embeddedObj && typeof embeddedObj === 'object') return embeddedObj;

  const candidates = [fenced?.[1], raw, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)].filter(Boolean);

  for (const candidate of candidates) {
    const cleaned = String(candidate).trim();
    if (!cleaned) continue;
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try the next candidate format.
    }
  }

  return null;
}

function normalizeAiText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      if (typeof content.text === 'string') return content.text;
      if (Array.isArray(content.parts)) {
        return content.parts
          .map((part) => (part && typeof part === 'object' ? String(part.text || '') : String(part || '')))
          .join('\n')
          .trim();
      }
    }
    return String(content || '');
  }

  const parts = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }
    if (part && typeof part === 'object' && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }

  return parts.join('\n').trim();
}

function parseScoreValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const text = String(value ?? '').trim();
  if (!text) return NaN;

  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;

  const ratio = text.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i);
  if (ratio) {
    const n = Number(ratio[1]);
    return Number.isFinite(n) ? n : NaN;
  }

  const firstNumber = text.match(/-?[0-9]+(?:\.[0-9]+)?/);
  if (!firstNumber) return NaN;
  const n = Number(firstNumber[0]);
  return Number.isFinite(n) ? n : NaN;
}

function pickFirstString(source, keys, fallback = '') {
  if (!source || typeof source !== 'object') return fallback;
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function normalizeActionValue(value) {
  const token = String(value || '').trim().toUpperCase();
  if (token === 'BUY' || token.includes('BUY')) return 'BUY';
  if (token === 'SELL' || token.includes('SELL')) return 'SELL';
  return 'HOLD';
}

function normalizeParsedRating(parsed) {
  if (typeof parsed === 'string') {
    parsed = parseGeminiJson(parsed);
  }

  if (parsed && typeof parsed === 'object') {
    const nested = parsed?.parsed || parsed?.output || parsed?.result || parsed?.data;
    if (nested && typeof nested === 'object') {
      parsed = nested;
    }
  }

  const strict = ratingSchema.safeParse(parsed);
  if (strict.success) {
    return strict.data;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const score = parseScoreValue(
    parsed?.score ?? parsed?.rating ?? parsed?.portfolioScore ?? parsed?.totalScore
  );
  const summary = pickFirstString(parsed, ['summary', 'analysis', 'explanation', 'rationale', 'overview']);

  const rawSuggestions =
    (Array.isArray(parsed?.suggestions) && parsed.suggestions) ||
    (Array.isArray(parsed?.recommendations) && parsed.recommendations) ||
    (Array.isArray(parsed?.actions) && parsed.actions) ||
    (Array.isArray(parsed?.picks) && parsed.picks) ||
    (Array.isArray(parsed?.items) && parsed.items) ||
    (Array.isArray(parsed?.stocks) && parsed.stocks) ||
    [];

  const suggestions = Array.isArray(rawSuggestions)
    ? rawSuggestions.map((item) => {
        const action = normalizeActionValue(item?.action ?? item?.recommendation ?? item?.signal ?? item?.decision);
        const symbol = String(item?.symbol || item?.sym || item?.ticker || item?.stock || 'PORTFOLIO').trim();
        const reason = String(
          item?.reason || item?.rationale || item?.explanation || item?.note || 'No reason provided.'
        ).trim();
        return {
          symbol: symbol || 'PORTFOLIO',
          action,
          reason: reason || 'No reason provided.',
        };
      })
        .filter((item) => item.symbol)
    : [];

  const risks = (
    Array.isArray(parsed?.risks)
      ? parsed.risks
      : Array.isArray(parsed?.riskFactors)
        ? parsed.riskFactors
        : []
  ).map((risk) => String(risk));

  // If score + summary are valid but symbol-level actions are missing,
  // keep the AI result usable instead of forcing fallback mode.
  if (Number.isFinite(score) && summary && suggestions.length === 0) {
    return {
      score,
      summary,
      suggestions: [
        {
          symbol: 'PORTFOLIO',
          action: 'HOLD',
          reason: 'AI returned overall analysis without symbol-level actions.',
        },
      ],
      risks,
    };
  }

  if (!Number.isFinite(score) || !summary || suggestions.length === 0) return null;

  return {
    score,
    summary,
    suggestions,
    risks,
  };
}

function isGeminiQuotaError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429) return true;
  return msg.includes('429') || msg.includes('quota') || msg.includes('too many requests') || msg.includes('rate-limit');
}

function extractRetryAfterSeconds(error) {
  const msg = String(error?.message || '');
  const m = msg.match(/retry(?:\s+in)?\s+([0-9]+(?:\.[0-9]+)?)s?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

function createFallbackRating(holdingsWithData) {
  let weightedDelta = 0;
  let totalWeight = 0;

  const suggestions = holdingsWithData.map((h) => {
    const current = Number(h.currentPrice || 0);
    const predicted = Number(h.predictedPrice || current);
    const qty = Math.max(0, Number(h.quantity || 0));
    const weight = Math.max(1, qty * Math.max(current, 1));
    const deltaPct = current > 0 ? ((predicted - current) / current) * 100 : 0;

    weightedDelta += deltaPct * weight;
    totalWeight += weight;

    let action = 'HOLD';
    if (deltaPct >= 3) action = 'BUY';
    else if (deltaPct <= -3) action = 'SELL';

    return {
      symbol: h.sym,
      action,
      reason: `Model delta ${round2(deltaPct)}% (predicted ${round2(predicted)} vs current ${round2(current)})`,
    };
  });

  const avgDelta = totalWeight > 0 ? weightedDelta / totalWeight : 0;
  const score = Math.max(0, Math.min(10, 5 + avgDelta / 2));

  return {
    score,
    summary:
      'Generated with local fallback because AI response was not valid JSON. Suggestions are based on predicted vs current price deltas.',
    suggestions,
    risks: ['Fallback mode used: validate decisions manually before trading.'],
    usedFallback: true,
  };
}

async function getPortfolioFromDb(userId) {
  const conn = await getConnection();
  try {
    const [walletRows] = await conn.query('SELECT balance FROM wallets WHERE user_id = ? LIMIT 1', [userId]);
    const walletBalance = Number(walletRows?.[0]?.balance ?? 0);

    const [holdingRows] = await conn.query(
      `SELECT sym, name, quantity, avg_price
       FROM portfolio_holdings
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [userId]
    );

    const holdings = (holdingRows || []).map((row) => ({
      sym: String(row.sym),
      name: String(row.name),
      quantity: Number(row.quantity),
      avgPrice: Number(row.avg_price),
    }));

    return { walletBalance, holdings };
  } finally {
    conn.release();
  }
}

export async function POST(req) {
  try {
    ensureAiEnv();

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const origin = req.nextUrl.origin;
    const portfolioDb = await getPortfolioFromDb(userId);

    if (!portfolioDb.holdings.length) {
      return NextResponse.json({ error: 'No holdings to rate. Buy stocks first.' }, { status: 400 });
    }

    const [{ json: marketJson }, ...symbolPayloads] = await Promise.all([
      fetchJson(`${origin}/api/market/stocks`),
      ...portfolioDb.holdings.map((h) =>
        Promise.all([
          fetchJson(`${origin}/api/market/history?symbol=${encodeURIComponent(h.sym)}&source=yahoo&range=3mo&interval=1day&outputsize=50`),
        ])
      ),
    ]);

    const marketMap = new Map();
    if (Array.isArray(marketJson?.stocks)) {
      for (const s of marketJson.stocks) {
        marketMap.set(String(s.sym), { price: Number(s.price || 0) });
      }
    }

    const holdingsWithData = [];

    for (let i = 0; i < portfolioDb.holdings.length; i++) {
      const holding = portfolioDb.holdings[i];
      const [historyRes] = symbolPayloads[i];

      const ohlc = Array.isArray(historyRes?.json?.ohlc) ? historyRes.json.ohlc : [];
      const closes50 = ohlc
        .map((p) => Number(p.close))
        .filter((v) => Number.isFinite(v))
        .slice(-50);

      if (closes50.length < 50) {
        continue;
      }

      const predictRes = await fetchJson(`${origin}/api/market/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closes: closes50 }),
      });

      const predictedPrice = Number(predictRes?.json?.predicted);
      const currentPrice = Number(marketMap.get(holding.sym)?.price || closes50[closes50.length - 1] || 0);

      holdingsWithData.push({
        sym: holding.sym,
        name: holding.name,
        quantity: holding.quantity,
        avgPrice: holding.avgPrice,
        currentPrice,
        predictedPrice: Number.isFinite(predictedPrice) ? predictedPrice : currentPrice,
        closes50,
      });
    }

    if (!holdingsWithData.length) {
      return NextResponse.json({ error: 'Unable to prepare 50-day data for holdings.' }, { status: 400 });
    }

    const prompt = [
      'You are a strict portfolio risk analyst.',
      'Given holdings with current price, model predicted price, and 50-day closes, return a score out of 10 and concise suggestions.',
      'Respond ONLY valid JSON with this exact schema:',
      '{"score": number, "summary": string, "suggestions": [{"symbol": string, "action": "BUY"|"SELL"|"HOLD", "reason": string}], "risks": [string]}',
      'Use 0 to 10 inclusive for score, with one decimal max.',
      'Data:',
      JSON.stringify({
        walletBalance: round2(portfolioDb.walletBalance),
        holdings: holdingsWithData.map((h) => ({
          sym: h.sym,
          name: h.name,
          quantity: round2(h.quantity),
          avgPrice: round2(h.avgPrice),
          currentPrice: round2(h.currentPrice),
          predictedPrice: round2(h.predictedPrice),
          closes50: h.closes50.map((x) => round2(x)),
        })),
      }),
    ].join('\n');

    const model = new ChatGoogleGenerativeAI({
      apiKey: getGeminiApiKey(),
      model: GEMINI_MODEL,
      temperature: 0.2,
      maxOutputTokens: 700,
      topP: 0.9,
    });

    let aiText = '';
    let parsed = null;
    let quotaExceeded = false;
    let retryAfterSec = null;

    try {
      const structuredModel = model.withStructuredOutput(ratingSchema);
      const structuredResp = await structuredModel.invoke(prompt);
      parsed = normalizeParsedRating(structuredResp);
    } catch (error) {
      if (isGeminiQuotaError(error)) {
        quotaExceeded = true;
        retryAfterSec = extractRetryAfterSeconds(error);
      }
      parsed = null;
    }

    if (!parsed && !quotaExceeded) {
      try {
        const aiResp = await model.invoke(prompt);
        aiText = normalizeAiText(aiResp?.content).trim();
        parsed = normalizeParsedRating(parseGeminiJson(aiText));
      } catch (error) {
        if (isGeminiQuotaError(error)) {
          quotaExceeded = true;
          retryAfterSec = extractRetryAfterSeconds(error);
        }
        parsed = null;
      }
    }

    if (!parsed && !quotaExceeded && aiText) {
      const repairPrompt = [
        'Convert the following model output into strict JSON only.',
        'Do not include markdown fences or extra text.',
        'Schema:',
        '{"score": number, "summary": string, "suggestions": [{"symbol": string, "action": "BUY"|"SELL"|"HOLD", "reason": string}], "risks": [string]}',
        'Input:',
        aiText,
      ].join('\n');

      try {
        const repairResp = await model.invoke(repairPrompt);
        const repairedText = normalizeAiText(repairResp?.content).trim();
        parsed = normalizeParsedRating(parseGeminiJson(repairedText));
        if (parsed) aiText = repairedText;
      } catch (error) {
        if (isGeminiQuotaError(error)) {
          quotaExceeded = true;
          retryAfterSec = extractRetryAfterSeconds(error);
        }
        parsed = null;
      }
    }

    const usedFallback = !parsed;
    if (!parsed) {
      parsed = createFallbackRating(holdingsWithData);
      if (quotaExceeded) {
        parsed.summary = retryAfterSec
          ? `Gemini quota limit reached. Using local fallback for now. Retry in about ${retryAfterSec}s for AI-generated scoring.`
          : 'Gemini quota limit reached. Using local fallback for now. Retry later for AI-generated scoring.';

        parsed.risks = Array.isArray(parsed.risks) ? parsed.risks : [];
        parsed.risks.unshift('Gemini API quota exceeded: fallback rating is heuristic, not AI-generated.');
      }
    }

    const score = Math.max(0, Math.min(10, Number(parsed?.score || 0)));
    const summary = String(parsed?.summary || 'No summary');
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const risks = Array.isArray(parsed?.risks) ? parsed.risks.map((r) => String(r)) : [];

    const snapshot = {
      userId,
      walletBalance: round2(portfolioDb.walletBalance),
      score: round2(score),
      summary,
      suggestions,
      holdings: holdingsWithData.map((h) => ({
        sym: h.sym,
        quantity: h.quantity,
        avgPrice: h.avgPrice,
        currentPrice: h.currentPrice,
        predictedPrice: h.predictedPrice,
      })),
      createdAt: new Date().toISOString(),
    };

    await upsertPortfolioSnapshotToChroma(snapshot);

    return NextResponse.json(
      {
        score: round2(score),
        summary,
        suggestions,
        risks,
        holdingsAnalyzed: holdingsWithData.length,
        walletBalance: round2(portfolioDb.walletBalance),
        meta: {
          model: GEMINI_MODEL,
          aiOutputParsed: !usedFallback,
          fallbackUsed: usedFallback,
          quotaExceeded,
          retryAfterSec,
          ratedAt: new Date().toISOString(),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portfolio rating failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
