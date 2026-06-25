import { ChromaClient } from 'chromadb';
import { loadServerEnvOnce } from './loadEnv';
import fs from 'fs';
import path from 'path';

loadServerEnvOnce();

const STOCKS_COLLECTION = 'stonks_stocks';
const CHATS_COLLECTION = 'stonks_chats';
const NEWS_COLLECTION = 'stonks_news';
const PORTFOLIO_COLLECTION = 'stonks_portfolio';
const EMBED_DIM = 64;

let clientPromise = null;
let stocksCollectionPromise = null;
let chatsCollectionPromise = null;
let newsCollectionPromise = null;
let portfolioCollectionPromise = null;

const fallbackStore = {
  stocks: new Map(), // sym -> { document, metadata }
  news: new Map(), // id -> { document, metadata }
  chatsBySession: new Map(), // sessionId -> [{ id, document, metadata }]
  portfolio: new Map(), // userId -> { document, metadata }
};

const FALLBACK_DB_PATH = path.join(process.cwd(), '.stonks_fallback_db.json');

function loadFallbackDb() {
  try {
    if (fs.existsSync(FALLBACK_DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(FALLBACK_DB_PATH, 'utf-8'));
      if (data.chatsBySession) {
        for (const [k, v] of Object.entries(data.chatsBySession)) {
          fallbackStore.chatsBySession.set(k, v);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load fallback db", e);
  }
}

function saveFallbackDb() {
  try {
    const data = {
      chatsBySession: Object.fromEntries(fallbackStore.chatsBySession),
    };
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.error("Failed to save fallback db", e);
  }
}

loadFallbackDb();

function reqEnv(name) {
  const value = process.env[name];
  if (!value) {
    const err = new Error(`Missing required env var: ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return value;
}

function embeddingForText(text) {
  const vector = Array(EMBED_DIM).fill(0);
  const input = String(text ?? '').toLowerCase();
  if (!input.trim()) return vector;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const idx = (code + i * 17) % EMBED_DIM;
    vector[idx] += (code % 31) / 31;
  }

  const mag = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0)) || 1;
  return vector.map((n) => Number((n / mag).toFixed(8)));
}

function embeddingsForTexts(texts) {
  return texts.map((txt) => embeddingForText(txt));
}

const LOCAL_EMBEDDING_FUNCTION = {
  name: 'stonks-local-embedding',
  generate: async (texts) => embeddingsForTexts(Array.isArray(texts) ? texts : []),
  generateForQueries: async (texts) => embeddingsForTexts(Array.isArray(texts) ? texts : []),
  defaultSpace: () => 'cosine',
  supportedSpaces: () => ['cosine', 'l2', 'ip'],
  getConfig: () => ({ provider: 'local', dim: EMBED_DIM }),
};

async function getClient() {
  if (!clientPromise) {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    const apiKey = process.env.CHROMA_API_KEY;
    const tenant = process.env.CHROMA_TENANT;
    const database = process.env.CHROMA_DATABASE;

    let parsed;
    try {
      parsed = new URL(chromaUrl);
    } catch {
      parsed = new URL('http://localhost:8000');
    }

    const ssl = parsed.protocol === 'https:';
    const host = parsed.hostname || 'localhost';
    const port = parsed.port ? Number(parsed.port) : (ssl ? 443 : 80);

    const config = { ssl, host, port };
    if (apiKey) config.auth = { provider: 'token', credentials: apiKey };
    if (tenant) config.tenant = tenant;
    if (database) config.database = database;

    clientPromise = Promise.resolve(new ChromaClient(config));
  }
  return clientPromise;
}

async function getStocksCollection() {
  if (!stocksCollectionPromise) {
    stocksCollectionPromise = getClient().then((client) =>
      client.getOrCreateCollection({
        name: STOCKS_COLLECTION,
        metadata: { app: 'stonks', kind: 'stocks' },
        embeddingFunction: LOCAL_EMBEDDING_FUNCTION,
      })
    );
  }
  return stocksCollectionPromise;
}

async function getChatsCollection() {
  if (!chatsCollectionPromise) {
    chatsCollectionPromise = getClient().then((client) =>
      client.getOrCreateCollection({
        name: CHATS_COLLECTION,
        metadata: { app: 'stonks', kind: 'chats' },
        embeddingFunction: LOCAL_EMBEDDING_FUNCTION,
      })
    );
  }
  return chatsCollectionPromise;
}

async function getNewsCollection() {
  if (!newsCollectionPromise) {
    newsCollectionPromise = getClient().then((client) =>
      client.getOrCreateCollection({
        name: NEWS_COLLECTION,
        metadata: { app: 'stonks', kind: 'news' },
        embeddingFunction: LOCAL_EMBEDDING_FUNCTION,
      })
    );
  }
  return newsCollectionPromise;
}

async function getPortfolioCollection() {
  if (!portfolioCollectionPromise) {
    portfolioCollectionPromise = getClient().then((client) =>
      client.getOrCreateCollection({
        name: PORTFOLIO_COLLECTION,
        metadata: { app: 'stonks', kind: 'portfolio' },
        embeddingFunction: LOCAL_EMBEDDING_FUNCTION,
      })
    );
  }
  return portfolioCollectionPromise;
}

async function safeUpsert(collection, payload) {
  if (typeof collection.upsert === 'function') {
    await collection.upsert(payload);
    return;
  }

  if (typeof collection.delete === 'function') {
    await collection.delete({ ids: payload.ids }).catch(() => {});
  }
  await collection.add(payload);
}

function similarity(a, b) {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}

function fallbackUpsertStocks(stocks) {
  for (const s of stocks) {
    const sym = String(s.sym);
    fallbackStore.stocks.set(sym, {
      document: stockDoc(s),
      metadata: {
        source: 'stock',
        sym,
        sector: String(s.sector || 'Unknown'),
        name: String(s.name || sym),
        price: Number(s.price || 0),
        chg: Number(s.chg || 0),
        live: Boolean(s.live),
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

function fallbackStoreChat({ sessionId, prompt, answer }) {
  const now = new Date().toISOString();
  const session = String(sessionId || 'default');
  const list = fallbackStore.chatsBySession.get(session) || [];

  list.push({
    id: `chat:${session}:user:${Date.now()}`,
    document: `Role: user\nPrompt: ${prompt}`,
    metadata: { source: 'chat', role: 'user', sessionId: session, createdAt: now },
  });
  list.push({
    id: `chat:${session}:assistant:${Date.now() + 1}`,
    document: `Role: assistant\nAnswer: ${answer}`,
    metadata: { source: 'chat', role: 'assistant', sessionId: session, createdAt: now },
  });

  fallbackStore.chatsBySession.set(session, list);
  saveFallbackDb();
}

function makeNewsId(item, i) {
  const base = `${item?.source || ''}|${item?.headline || ''}|${item?.time || ''}|${i}`;
  let h = 0;
  for (let j = 0; j < base.length; j++) h = ((h << 5) - h + base.charCodeAt(j)) | 0;
  return `news:${Math.abs(h)}`;
}

function newsDoc(item) {
  return [
    `Headline: ${String(item?.headline || '')}`,
    `Description: ${String(item?.description || '')}`,
    `Sentiment: ${String(item?.sentiment || 'neutral')}`,
    `Impact: ${String(item?.impact || 'low')}`,
    `Time: ${String(item?.time || '')}`,
    `Source: ${String(item?.source || 'Market Wire')}`,
    `URL: ${String(item?.url || '')}`,
  ].join('\n');
}

function fallbackUpsertNews(newsItems) {
  newsItems.forEach((item, i) => {
    const id = makeNewsId(item, i);
    fallbackStore.news.set(id, {
      document: newsDoc(item),
      metadata: {
        source: 'news',
        headline: String(item?.headline || ''),
        sentiment: String(item?.sentiment || 'neutral'),
        impact: String(item?.impact || 'low'),
        provider: String(item?.source || 'Market Wire'),
        time: String(item?.time || ''),
        url: String(item?.url || ''),
        updatedAt: new Date().toISOString(),
      },
    });
  });
}

function fallbackQueryContext(prompt, sessionId, opts = {}) {
  const stockLimit = Number(opts.stockLimit || 8);
  const newsLimit = Number(opts.newsLimit || 10);
  const chatLimit = Number(opts.chatLimit || 8);
  const q = embeddingForText(prompt);

  const stocks = Array.from(fallbackStore.stocks.values())
    .map((item) => {
      const emb = embeddingForText(item.document);
      const score = similarity(q, emb);
      return {
        document: item.document,
        metadata: item.metadata,
        distance: Number((1 - score).toFixed(6)),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, stockLimit)
    .map(({ score, ...rest }) => rest);

  const allChats = fallbackStore.chatsBySession.get(String(sessionId)) || [];
  const chats = allChats
    .map((item) => {
      const emb = embeddingForText(item.document);
      const score = similarity(q, emb);
      return {
        document: item.document,
        metadata: item.metadata,
        distance: Number((1 - score).toFixed(6)),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, chatLimit)
    .map(({ score, ...rest }) => rest);

  const news = Array.from(fallbackStore.news.values())
    .map((item) => {
      const emb = embeddingForText(item.document);
      const score = similarity(q, emb);
      return {
        document: item.document,
        metadata: item.metadata,
        distance: Number((1 - score).toFixed(6)),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, newsLimit)
    .map(({ score, ...rest }) => rest);

  return { stocks, news, chats };
}

function fallbackGetHistory(sessionId, limit = 80) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return [];
  const list = fallbackStore.chatsBySession.get(safeSessionId) || [];

  const items = list.map((item) => {
    const metadata = item.metadata || {};
    const role = metadata?.role === 'user' ? 'user' : 'assistant';
    return {
      id: String(item.id),
      role,
      text: extractChatText(item.document, role),
      createdAt: String(metadata?.createdAt || ''),
      ts: Date.parse(String(metadata?.createdAt || '')) || 0,
    };
  });

  items.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.role !== b.role) return a.role === 'user' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const start = Math.max(0, items.length - Number(limit || 80));
  return items.slice(start).map(({ ts, ...rest }) => rest);
}

function portfolioDoc(snapshot) {
  const holdingsText = (snapshot?.holdings || [])
    .map((h) => `${h.sym}: qty=${h.quantity}, avg=${h.avgPrice}, current=${h.currentPrice}, predicted=${h.predictedPrice}`)
    .join('; ');

  const suggestionsText = (snapshot?.suggestions || [])
    .map((s) => `${s.symbol || 'PORTFOLIO'} ${s.action}: ${s.reason}`)
    .join('; ');

  return [
    `UserId: ${snapshot.userId}`,
    `WalletBalance: ${snapshot.walletBalance}`,
    `Score: ${snapshot.score}/10`,
    `Summary: ${snapshot.summary || ''}`,
    `Holdings: ${holdingsText}`,
    `Suggestions: ${suggestionsText}`,
    `Timestamp: ${snapshot.createdAt || new Date().toISOString()}`,
  ].join('\n');
}

function stockDoc(stock) {
  const symbol = String(stock.sym || '').replace('.NSE', '');
  const currency = String(stock.sym || '').includes('.NSE') ? 'INR' : 'USD';
  return [
    `Symbol: ${symbol}`,
    `Name: ${stock.name}`,
    `Sector: ${stock.sector}`,
    `Price: ${stock.price} ${currency}`,
    `ChangePercent: ${stock.chg}%`,
    `Volume: ${stock.vol}`,
    `Live: ${stock.live ? 'yes' : 'no'}`,
  ].join('\n');
}

export async function upsertStocksToChroma(stocks) {
  if (!Array.isArray(stocks) || stocks.length === 0) return 0;

  let collection;
  try {
    collection = await getStocksCollection();
  } catch {
    fallbackUpsertStocks(stocks);
    return stocks.length;
  }
  const ids = stocks.map((s) => `stock:${s.sym}`);
  const documents = stocks.map(stockDoc);
  const metadatas = stocks.map((s) => ({
    source: 'stock',
    sym: String(s.sym),
    sector: String(s.sector || 'Unknown'),
    name: String(s.name || s.sym),
    price: Number(s.price || 0),
    chg: Number(s.chg || 0),
    live: Boolean(s.live),
    updatedAt: new Date().toISOString(),
  }));
  const embeddings = embeddingsForTexts(documents);

  try {
    await safeUpsert(collection, { ids, documents, metadatas, embeddings });
  } catch {
    fallbackUpsertStocks(stocks);
  }
  return stocks.length;
}

export async function upsertNewsToChroma(newsItems) {
  if (!Array.isArray(newsItems) || newsItems.length === 0) return 0;

  let collection;
  try {
    collection = await getNewsCollection();
  } catch {
    fallbackUpsertNews(newsItems);
    return newsItems.length;
  }

  const ids = newsItems.map((item, i) => makeNewsId(item, i));
  const documents = newsItems.map((item) => newsDoc(item));
  const metadatas = newsItems.map((item) => ({
    source: 'news',
    headline: String(item?.headline || ''),
    sentiment: String(item?.sentiment || 'neutral'),
    impact: String(item?.impact || 'low'),
    provider: String(item?.source || 'Market Wire'),
    time: String(item?.time || ''),
    url: String(item?.url || ''),
    updatedAt: new Date().toISOString(),
  }));
  const embeddings = embeddingsForTexts(documents);

  try {
    await safeUpsert(collection, { ids, documents, metadatas, embeddings });
  } catch {
    fallbackUpsertNews(newsItems);
  }

  return newsItems.length;
}

export async function upsertPortfolioSnapshotToChroma(snapshot) {
  if (!snapshot || !snapshot.userId) return false;

  const userId = String(snapshot.userId);
  const id = `portfolio:${userId}`;
  const document = portfolioDoc(snapshot);
  const metadata = {
    source: 'portfolio',
    userId,
    score: Number(snapshot.score || 0),
    walletBalance: Number(snapshot.walletBalance || 0),
    holdingsCount: Array.isArray(snapshot.holdings) ? snapshot.holdings.length : 0,
    createdAt: String(snapshot.createdAt || new Date().toISOString()),
  };

  let collection;
  try {
    collection = await getPortfolioCollection();
  } catch {
    fallbackStore.portfolio.set(userId, { document, metadata });
    return true;
  }

  try {
    await safeUpsert(collection, {
      ids: [id],
      documents: [document],
      metadatas: [metadata],
      embeddings: embeddingsForTexts([document]),
    });
  } catch {
    fallbackStore.portfolio.set(userId, { document, metadata });
  }

  return true;
}

export async function queryChromaContext(prompt, sessionId, opts = {}) {
  const stockLimit = Number(opts.stockLimit || 8);
  const newsLimit = Number(opts.newsLimit || 10);
  const chatLimit = Number(opts.chatLimit || 8);
  const q = embeddingForText(prompt);

  let stocksCollection;
  let newsCollection;
  let chatsCollection;
  try {
    [stocksCollection, newsCollection, chatsCollection] = await Promise.all([
      getStocksCollection(),
      getNewsCollection(),
      getChatsCollection(),
    ]);
  } catch {
    return fallbackQueryContext(prompt, sessionId, { stockLimit, newsLimit, chatLimit });
  }

  let stockRes = null;
  let newsRes = null;
  let chatRes = null;
  try {
    [stockRes, newsRes, chatRes] = await Promise.all([
      stocksCollection.query({
        queryEmbeddings: [q],
        nResults: stockLimit,
        include: ['documents', 'metadatas', 'distances'],
      }),
      newsCollection.query({
        queryEmbeddings: [q],
        nResults: newsLimit,
        include: ['documents', 'metadatas', 'distances'],
      }),
      chatsCollection.query({
        queryEmbeddings: [q],
        nResults: chatLimit,
        where: { sessionId: String(sessionId) },
        include: ['documents', 'metadatas', 'distances'],
      }),
    ]);
  } catch {
    return fallbackQueryContext(prompt, sessionId, { stockLimit, newsLimit, chatLimit });
  }

  const stocks = (stockRes?.documents?.[0] || []).map((doc, i) => ({
    document: doc,
    metadata: stockRes?.metadatas?.[0]?.[i] || {},
    distance: stockRes?.distances?.[0]?.[i] ?? null,
  }));

  const chats = (chatRes?.documents?.[0] || []).map((doc, i) => ({
    document: doc,
    metadata: chatRes?.metadatas?.[0]?.[i] || {},
    distance: chatRes?.distances?.[0]?.[i] ?? null,
  }));

  const news = (newsRes?.documents?.[0] || []).map((doc, i) => ({
    document: doc,
    metadata: newsRes?.metadatas?.[0]?.[i] || {},
    distance: newsRes?.distances?.[0]?.[i] ?? null,
  }));

  return { stocks, news, chats };
}

export async function storeChatTurn({ sessionId, prompt, answer }) {
  let chatsCollection;
  try {
    chatsCollection = await getChatsCollection();
  } catch {
    fallbackStoreChat({ sessionId, prompt, answer });
    return;
  }
  const now = new Date().toISOString();

  const docs = [
    `Role: user\nPrompt: ${prompt}`,
    `Role: assistant\nAnswer: ${answer}`,
  ];

  const ids = [
    `chat:${sessionId}:user:${Date.now()}`,
    `chat:${sessionId}:assistant:${Date.now() + 1}`,
  ];

  const metadatas = [
    { source: 'chat', role: 'user', sessionId, createdAt: now },
    { source: 'chat', role: 'assistant', sessionId, createdAt: now },
  ];

  const embeddings = embeddingsForTexts(docs);
  try {
    await safeUpsert(chatsCollection, { ids, documents: docs, metadatas, embeddings });
  } catch {
    fallbackStoreChat({ sessionId, prompt, answer });
  }
}

function extractChatText(doc, role) {
  const str = String(doc || '');
  if (role === 'user') {
    return str.replace(/^Role:\s*user\s*\nPrompt:\s*/i, '').trim();
  }
  return str.replace(/^Role:\s*assistant\s*\nAnswer:\s*/i, '').trim();
}

export async function getChatHistory(sessionId, limit = 80) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return [];

  let chatsCollection;
  try {
    chatsCollection = await getChatsCollection();
  } catch {
    return fallbackGetHistory(safeSessionId, limit);
  }

  const result = await chatsCollection.get({
    where: { sessionId: safeSessionId },
    include: ['documents', 'metadatas'],
  }).catch(() => null);

  if (!result) {
    return fallbackGetHistory(safeSessionId, limit);
  }

  const ids = result?.ids || [];
  const docs = result?.documents || [];
  const metas = result?.metadatas || [];

  const items = ids.map((id, i) => {
    const metadata = metas[i] || {};
    const role = metadata?.role === 'user' ? 'user' : 'assistant';
    return {
      id: String(id),
      role,
      text: extractChatText(docs[i], role),
      createdAt: String(metadata?.createdAt || ''),
      ts: Date.parse(String(metadata?.createdAt || '')) || 0,
    };
  });

  items.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.role !== b.role) return a.role === 'user' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const start = Math.max(0, items.length - Number(limit || 80));
  return items.slice(start).map(({ ts, ...rest }) => rest);
}

export function ensureAiEnv() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    const err = new Error('Missing required env var: GEMINI_API_KEY or GOOGLE_API_KEY');
    err.statusCode = 500;
    throw err;
  }
  return true;
}

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function fallbackDeleteSession(sessionId) {
  const safeSessionId = String(sessionId || '').trim();
  if (fallbackStore.chatsBySession.has(safeSessionId)) {
    fallbackStore.chatsBySession.delete(safeSessionId);
    saveFallbackDb();
  }
}

export async function deleteChatSession(sessionId) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return false;

  let chatsCollection;
  try {
    chatsCollection = await getChatsCollection();
  } catch {
    fallbackDeleteSession(safeSessionId);
    return true;
  }

  try {
    await chatsCollection.delete({
      where: { sessionId: safeSessionId }
    });
    fallbackDeleteSession(safeSessionId);
    return true;
  } catch (e) {
    fallbackDeleteSession(safeSessionId);
    return true;
  }
}
