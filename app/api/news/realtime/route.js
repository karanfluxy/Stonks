import { NextResponse } from 'next/server';
import { getMarketNews } from '../../lib/newsApi';
import { upsertNewsToChroma } from '../../lib/chromaMemory';

const FIXED_NEWS_COUNT = 50;

const NEWS_FALLBACK = [
  { headline: 'Global equities inch higher as bond yields cool overnight', sentiment: 'bullish', impact: 'medium', sentimentReview: 'Fallback review: bullish sentiment detected from macro headline context.', time: '8m ago', source: 'Market Wire', url: null },
  { headline: 'Tech stocks mixed ahead of major earnings this week', sentiment: 'neutral', impact: 'medium', sentimentReview: 'Fallback review: mixed cues suggest neutral near-term sentiment.', time: '22m ago', source: 'Market Wire', url: null },
  { headline: 'Crude oil volatility rises on fresh geopolitical concerns', sentiment: 'bearish', impact: 'high', sentimentReview: 'Fallback review: risk-heavy language indicates bearish sentiment.', time: '47m ago', source: 'Market Wire', url: null },
  { headline: 'RBI commentary keeps banking names in focus', sentiment: 'neutral', impact: 'high', sentimentReview: 'Fallback review: policy watch tone remains neutral until further guidance.', time: '1h ago', source: 'Market Wire', url: null },
  { headline: 'Chipmakers rally after upbeat demand guidance', sentiment: 'bullish', impact: 'medium', sentimentReview: 'Fallback review: positive guidance signals bullish momentum.', time: '2h ago', source: 'Market Wire', url: null },
];

export async function GET(request) {
  // Keep a consistent fresh-50 feed for UI and downstream sentiment processing.
  const count = FIXED_NEWS_COUNT;

  try {
    const result = await getMarketNews({
      query: 'stock market OR nifty OR sensex OR nasdaq OR dow jones',
      pageSize: count,
      maxArticles: count,
      ttlMs: 15 * 60_000,
    });

    // Call custom Python BiLSTM sentiment model to classify headlines
    try {
      const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';
      const headlines = result.items.map(item => item.headline);
      const res = await fetch(`${mlUrl}/api/models/news-sentiment/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: headlines }),
      });
      if (res.ok) {
        const data = await res.json();
        const predictions = data.results || [];
        predictions.forEach((pred, index) => {
          if (result.items[index]) {
            result.items[index].sentiment = pred.sentiment;
            result.items[index].sentimentConfidence = pred.confidence;
            result.items[index].sentimentReview = `BiLSTM model prediction: ${pred.sentiment} (Confidence: ${(pred.confidence * 100).toFixed(1)}%)`;
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch sentiment from local ML model:", e);
    }

    await upsertNewsToChroma(result.items).catch(() => {});

    return NextResponse.json(
      {
        news: result.items,
        meta: {
          ...result.meta,
          pollMs: 15 * 60_000,
          requestedAt: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'news-provider-unavailable'
      : (error instanceof Error ? error.message : 'news-provider-unavailable');

    return NextResponse.json(
      {
        news: NEWS_FALLBACK,
        meta: {
          source: 'fallback',
          reason: message,
          pollMs: 15 * 60_000,
          requestedAt: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
