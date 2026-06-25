import { NextResponse } from 'next/server';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { loadServerEnvOnce } from '../../lib/loadEnv';
import {
  ensureAiEnv,
  getGeminiApiKey,
  getChatHistory,
  queryChromaContext,
  storeChatTurn,
  upsertNewsToChroma,
  upsertStocksToChroma,
  deleteChatSession,
} from '../../lib/chromaMemory';

loadServerEnvOnce();

const GEMINI_MODEL = 'gemini-3-flash-preview';
const MAX_SESSION_MESSAGES = Number(process.env.AI_CHAT_SESSION_MESSAGE_LIMIT || 40);
const STOCKS_FETCH_TIMEOUT_MS = Number(process.env.AI_STOCKS_FETCH_TIMEOUT_MS || 12000);
const NEWS_FETCH_TIMEOUT_MS = Number(process.env.AI_NEWS_FETCH_TIMEOUT_MS || 12000);
const CHROMA_TIMEOUT_MS = 1500; // Force fast timeout so it doesn't hang if Chroma is down
const AI_INFER_TIMEOUT_MS = Number(process.env.AI_INFER_TIMEOUT_MS || 60000);
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
const CHAT_MODEL_PROVIDER = 'gemini';
const CHAT_MODEL_ENABLE_FALLBACK = process.env.CHAT_MODEL_ENABLE_FALLBACK === 'true';

const HF_STOCK_MODEL_ENABLED = process.env.HF_STOCK_MODEL_ENABLED === 'true';
const HF_STOCK_MODEL_URL = process.env.HF_STOCK_MODEL_URL || 'https://raghav6753-chatbot.hf.space';
const HF_STOCK_MODEL_API_NAME = process.env.HF_STOCK_MODEL_API_NAME || 'answer';
const HF_STOCK_MODEL_TIMEOUT_MS = Number(process.env.HF_STOCK_MODEL_TIMEOUT_MS || 120000);
const HF_TOKEN = process.env.HF_TOKEN || '';

let aiChainPromise = null;

function normalizeAiError(error) {
  const raw = error instanceof Error ? error.message : String(error || 'AI chat failed');
  const message = String(raw || 'AI chat failed');

  const isInvalidKey =
    message.includes('API_KEY_INVALID') ||
    message.toLowerCase().includes('api key expired') ||
    message.toLowerCase().includes('api key not valid');

  if (isInvalidKey) {
    return {
      status: 401,
      body: {
        error: 'Gemini API key is invalid or expired. Update GEMINI_API_KEY (or GOOGLE_API_KEY) and restart the server.',
        code: 'GEMINI_API_KEY_INVALID',
      },
    };
  }

  return {
    status: 500,
    body: {
      error: message,
    },
  };
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchStocksFromApi(origin) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STOCKS_FETCH_TIMEOUT_MS);
  const res = await fetch(`${origin}/api/market/stocks`, { cache: 'no-store', signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timeoutId));
  if (!res) return [];
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.stocks) ? data.stocks : [];
}

async function fetchNewsFromApi(origin) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);
  const res = await fetch(`${origin}/api/news/realtime?count=50`, { cache: 'no-store', signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timeoutId));
  if (!res) return [];
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.news) ? data.news : [];
}

function toStockDocs(stocks) {
  return stocks.map((s) => ({
    document: [
      `Symbol: ${String(s?.sym || '')}`,
      `Name: ${String(s?.name || '')}`,
      `Sector: ${String(s?.sector || '')}`,
      `Price: ${Number(s?.price || 0)}`,
      `ChangePercent: ${Number(s?.chg || 0)}%`,
      `Volume: ${String(s?.vol || '—')}`,
      `Live: ${s?.live ? 'yes' : 'no'}`,
    ].join('\n'),
    metadata: {
      sym: String(s?.sym || ''),
      live: Boolean(s?.live),
    },
    distance: null,
  }));
}

function toNewsDocs(news) {
  return news.map((n) => ({
    document: [
      `Headline: ${String(n?.headline || '')}`,
      `Description: ${String(n?.description || '')}`,
      `Sentiment: ${String(n?.sentiment || 'neutral')}`,
      `Impact: ${String(n?.impact || 'low')}`,
      `Time: ${String(n?.time || '')}`,
      `Source: ${String(n?.source || 'Market Wire')}`,
      `URL: ${String(n?.url || '')}`,
    ].join('\n'),
    metadata: {
      source: String(n?.source || 'Market Wire'),
      sentiment: String(n?.sentiment || 'neutral'),
      impact: String(n?.impact || 'low'),
    },
    distance: null,
  }));
}

function getAiChain() {
  if (!aiChainPromise) {
    const apiKey = getGeminiApiKey();
    const model = new ChatGoogleGenerativeAI({
      apiKey,
      model: GEMINI_MODEL,
      temperature: 0.25,
      maxOutputTokens: 4000,
      topP: 0.9,
    });

    const prompt = ChatPromptTemplate.fromTemplate(`
You are Stonks AI assistant for a stock dashboard.
Use only the provided database context for stock data; if data is missing, say so clearly.
Keep answers concise and actionable.
IMPORTANT: Format your response using clean, readable bullet points. DO NOT use markdown tables under any circumstances. Use **bold** text for emphasis and stock tickers.

=== STOCK DB CONTEXT ===
{stockContext}

=== NEWS DB CONTEXT ===
{newsContext}

=== CHAT MEMORY DB CONTEXT ===
{chatContext}

=== USER PROMPT ===
{question}
    `);

    aiChainPromise = Promise.resolve(
      RunnableSequence.from([
        prompt,
        model,
        new StringOutputParser(),
      ])
    );
  }
  return aiChainPromise;
}

async function callGeminiWithLangChain({ userPrompt, stockDocs, newsDocs, chatDocs }) {
  const stockContext = stockDocs.length
    ? stockDocs.map((s, i) => `StockContext ${i + 1}:\n${s.document}`).join('\n\n')
    : 'No stock context available.';

  const newsContext = newsDocs.length
    ? newsDocs.map((n, i) => `NewsContext ${i + 1}:\n${n.document}`).join('\n\n')
    : 'No news context available.';

  const chatContext = chatDocs.length
    ? chatDocs.map((c, i) => `Memory ${i + 1}:\n${c.document}`).join('\n\n')
    : 'No prior chat memory.';

  const chain = await getAiChain();
  const text = await withTimeout(
    chain.invoke({
      stockContext,
      newsContext,
      chatContext,
      question: userPrompt,
    }),
    AI_INFER_TIMEOUT_MS,
    'AI inference'
  );

  return String(text || '').trim() || 'I could not generate a response from the available data.';
}

async function callLocalChatService({ userPrompt, stockDocs, newsDocs, chatDocs }) {
  console.log("Routing local chat request directly to Gemini API...");
  return await callGeminiWithLangChain({ userPrompt, stockDocs, newsDocs, chatDocs });
}

async function callHFStockModel({ previousChat, stockData, newsData, question }) {
  const baseUrl = HF_STOCK_MODEL_URL;

  // Step 1: POST to initiate request and get event_id
  const postRes = await fetch(`${baseUrl}/gradio_api/call/${HF_STOCK_MODEL_API_NAME}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {})
    },
    body: JSON.stringify({
      data: [previousChat || '', stockData || '', newsData || '', question || '']
    })
  });

  if (!postRes.ok) {
    throw new Error(`HF POST failed: ${postRes.status} ${postRes.statusText}`);
  }

  const postJson = await postRes.json();
  const eventId = postJson.event_id;

  if (!eventId) {
    throw new Error('HF response did not include event_id');
  }

  // Step 2: GET to poll for result (SSE)
  const getRes = await fetch(`${baseUrl}/gradio_api/call/${HF_STOCK_MODEL_API_NAME}/${eventId}`, {
    headers: {
      ...(HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {})
    }
  });

  if (!getRes.ok) {
    throw new Error(`HF result fetch failed: ${getRes.status} ${getRes.statusText}`);
  }

  const sseText = await getRes.text();

  // The response is SSE. We look for the final data line.
  const lines = sseText.split('\n');
  const dataLines = lines.filter((line) => line.startsWith('data: '));
  
  if (dataLines.length === 0) {
    throw new Error('HF SSE response did not contain any data lines');
  }

  // Gradio sends multiple generating events, the last one has the complete response
  const dataLine = dataLines[dataLines.length - 1];

  try {
    const jsonStr = dataLine.replace('data: ', '');
    
    // If the space returns an error, it might look like {"error": "..."}
    if (jsonStr.includes('"error"')) {
       try {
         const errObj = JSON.parse(jsonStr);
         if (errObj.error) throw new Error(errObj.error);
       } catch (e) {
         if (e.message !== 'Unexpected token') throw e;
       }
    }

    const parsed = JSON.parse(jsonStr);
    let answer = Array.isArray(parsed) ? parsed[0] : parsed;

    if (!answer || typeof answer !== 'string') {
      throw new Error(`HF returned invalid or empty answer: ${JSON.stringify(parsed)}`);
    }

    // Remove <think>...</think> tags if present
    answer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if (!answer) {
      throw new Error('HF returned empty answer after cleanup');
    }

    return answer;
  } catch (e) {
    throw new Error(`Failed to parse HF response: ${e.message}`);
  }
}

export async function GET(req) {
  try {
    const sessionId = String(req.nextUrl.searchParams.get('sessionId') || '').trim().slice(0, 100);
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const limit = Number(req.nextUrl.searchParams.get('limit') || 80);
    const messages = await getChatHistory(sessionId, Number.isFinite(limit) ? limit : 80);

    return NextResponse.json(
      { messages, meta: { sessionId, count: messages.length, sessionLimit: MAX_SESSION_MESSAGES } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chat history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    ensureAiEnv();

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    const sessionId = String(body?.sessionId || 'default').slice(0, 100);

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const history = await withTimeout(getChatHistory(sessionId, 500), CHROMA_TIMEOUT_MS, 'Chat history lookup');
    if (history.length >= MAX_SESSION_MESSAGES) {
      return NextResponse.json(
        {
          error: 'This chat reached its message limit. Please start a new chat.',
          code: 'CHAT_LIMIT_REACHED',
          meta: { sessionId, count: history.length, sessionLimit: MAX_SESSION_MESSAGES },
        },
        { status: 429 }
      );
    }

    const origin = req.nextUrl.origin;
    const stocks = await fetchStocksFromApi(origin);
    const news = await fetchNewsFromApi(origin);
    if (!stocks.length) {
      return NextResponse.json(
        {
          error: 'No stocks available from market API right now. Please try again shortly.',
          code: 'NO_STOCKS',
        },
        { status: 503 }
      );
    }
    await upsertStocksToChroma(stocks);
    if (news.length > 0) {
      await upsertNewsToChroma(news).catch(() => {});
    }

    const stockDocs = toStockDocs(stocks);
    const newsDocs = toNewsDocs(news);
    const context = await withTimeout(
      queryChromaContext(prompt, sessionId, { stockLimit: 1, newsLimit: 1, chatLimit: 8 }),
      CHROMA_TIMEOUT_MS,
      'Context query'
    );

    let answer;
    let usedProvider = CHAT_MODEL_PROVIDER;

    try {
      if (CHAT_MODEL_PROVIDER === 'local_finetuned') {
        try {
          answer = await withTimeout(
            callLocalChatService({
              userPrompt: prompt,
              stockDocs,
              newsDocs,
              chatDocs: context.chats,
            }),
            AI_INFER_TIMEOUT_MS,
            'Local AI inference'
          );
        } catch (localError) {
          console.error('Local fine-tuned chat model failed:', localError.message);
          // Fallback to true if undefined
          const shouldFallback = process.env.CHAT_MODEL_ENABLE_FALLBACK !== 'false';
          if (shouldFallback) {
            console.log('Falling back to Gemini...');
            usedProvider = 'gemini';
            try {
              answer = await callGeminiWithLangChain({
                userPrompt: prompt,
                stockDocs,
                newsDocs,
                chatDocs: context.chats,
              });
            } catch (geminiError) {
              console.error('Gemini fallback also failed:', geminiError.message);
              throw new Error(`Both primary model and Gemini fallback failed. Primary error: ${localError.message}`);
            }
          } else {
            throw localError;
          }
        }
      } else if (CHAT_MODEL_PROVIDER === 'huggingface') {
        try {
          const stockContext = stockDocs.length
            ? stockDocs.map((s) => s.document).join('\n')
            : 'No stock data available.';

          const newsContext = newsDocs.length
            ? newsDocs.map((n) => n.document).join('\n')
            : 'No news data available.';

          const chatContext = context.chats.length
            ? context.chats.map((c) => c.document).join('\n')
            : 'No previous chat history.';

          answer = await withTimeout(
            callHFStockModel({
              previousChat: chatContext,
              stockData: stockContext,
              newsData: newsContext,
              question: prompt,
            }),
            HF_STOCK_MODEL_TIMEOUT_MS,
            'Hugging Face AI inference'
          );
        } catch (hfError) {
          console.error('Hugging Face fine-tuned chat model failed:', hfError.message);
          // Fallback to true if undefined
          const shouldFallback = process.env.CHAT_MODEL_ENABLE_FALLBACK !== 'false';
          if (shouldFallback) {
            console.log('Falling back to Gemini...');
            usedProvider = 'gemini';
            try {
              answer = await callGeminiWithLangChain({
                userPrompt: prompt,
                stockDocs,
                newsDocs,
                chatDocs: context.chats,
              });
            } catch (geminiError) {
              console.error('Gemini fallback also failed:', geminiError.message);
              throw new Error(`Both primary model and Gemini fallback failed. Primary error: ${hfError.message}`);
            }
          } else {
            throw hfError;
          }
        }
      } else {
        answer = await callGeminiWithLangChain({
          userPrompt: prompt,
          stockDocs,
          newsDocs,
          chatDocs: context.chats,
        });
      }
    } catch (chatError) {
      throw chatError;
    }

    await withTimeout(storeChatTurn({ sessionId, prompt, answer }), CHROMA_TIMEOUT_MS, 'Store chat turn');

    return NextResponse.json(
      {
        answer,
        meta: {
          stocksIndexed: stocks.length,
          newsIndexed: news.length,
          stockMatches: stockDocs.length,
          newsMatches: newsDocs.length,
          memoryMatches: context.chats.length,
          model: usedProvider === 'gemini' ? GEMINI_MODEL : (usedProvider === 'huggingface' ? 'hf-fine-tuned' : 'local_finetuned'),
          provider: usedProvider,
          sessionLimit: MAX_SESSION_MESSAGES,
          messageCount: history.length + 2,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const normalized = normalizeAiError(error);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}

export async function DELETE(req) {
  try {
    const sessionId = String(req.nextUrl.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    await deleteChatSession(sessionId);

    return NextResponse.json({ success: true, message: 'Chat session deleted' }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete chat session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
