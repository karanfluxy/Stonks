'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Send, Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  meta?: any;
};

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i} className="text-foreground italic">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const SUGGESTED = [
  'Which stocks in my feed are trending up right now?',
  'Summarize top opportunities in technology stocks.',
  'Compare AAPL vs MSFT in one short view.',
  'What are the riskiest stocks from current data?',
];

const SESSION_KEY = 'stonks_ai_session_id';
const RECENT_SESSIONS_KEY = 'stonks_ai_recent_sessions';
const CHAT_REQUEST_TIMEOUT_MS = 610000;

export default function AiChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [recentSessions, setRecentSessions] = useState<{id: string, date: string}[]>([]);
  const [maxMessages, setMaxMessages] = useState(40);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let history: {id: string, date: string}[] = [];
    try {
      const stored = localStorage.getItem(RECENT_SESSIONS_KEY);
      if (stored) history = JSON.parse(stored);
    } catch {}

    const oldSession = localStorage.getItem(SESSION_KEY);
    if (history.length === 0 && oldSession) {
      history = [{ id: oldSession, date: new Date().toISOString() }];
      localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(history));
    }

    if (history.length > 0) {
      setRecentSessions(history);
      setSessionId(history[0].id);
    } else {
      const next = makeId();
      history = [{ id: next, date: new Date().toISOString() }];
      localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(history));
      setRecentSessions(history);
      setSessionId(next);
    }
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!sessionId) return;

    let alive = true;
    setHistoryLoading(true);
    setError(null);

    fetch(`/api/ai/chat?sessionId=${encodeURIComponent(sessionId)}&limit=80`, { cache: 'no-store' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) throw new Error(data?.error || 'Failed to load chat history');

        const incoming = Array.isArray(data?.messages) ? data.messages : [];
        if (Number.isFinite(Number(data?.meta?.sessionLimit))) {
          setMaxMessages(Number(data.meta.sessionLimit));
        }
        const normalized: ChatMessage[] = incoming.map((m: any) => ({
          id: String(m?.id || makeId()),
          role: m?.role === 'user' ? 'user' : 'assistant',
          text: String(m?.text || ''),
          createdAt: String(m?.createdAt || new Date().toISOString()),
        }));
        setMessages(normalized);
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err instanceof Error ? err.message : 'Failed to load chat history';
        setError(msg);
      })
      .finally(() => {
        if (!alive) return;
        setHistoryLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const limitReached = useMemo(() => messages.length >= maxMessages, [messages.length, maxMessages]);
  const canSend = useMemo(
    () => input.trim().length > 0 && !loading && !!sessionId && !limitReached,
    [input, loading, sessionId, limitReached]
  );

  function startNewChat() {
    const next = makeId();
    const newSession = { id: next, date: new Date().toISOString() };
    const updated = [newSession, ...recentSessions].slice(0, 5);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(updated));
    setRecentSessions(updated);
    setSessionId(next);
    setMessages([]);
    setInput('');
    setError(null);
  }

  function switchChat(id: string) {
    if (id === sessionId) return;
    setSessionId(id);
    setMessages([]);
    setInput('');
    setError(null);
  }

  async function deleteSession(id: string) {
    const updated = recentSessions.filter(s => s.id !== id);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(updated));
    setRecentSessions(updated);
    
    if (id === sessionId) {
      if (updated.length > 0) {
        setSessionId(updated[0].id);
        setMessages([]);
      } else {
        startNewChat();
      }
    }

    try {
      await fetch(`/api/ai/chat?sessionId=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.error("Failed to delete chat", e);
    }
  }

  async function sendPrompt(customPrompt?: string) {
    const prompt = (customPrompt ?? input).trim();
    if (!prompt || !sessionId || loading) return;

    if (limitReached) {
      setError('This chat reached its message limit. Please start a new chat.');
      return;
    }

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      text: prompt,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (Number.isFinite(Number(data?.meta?.sessionLimit))) {
          setMaxMessages(Number(data.meta.sessionLimit));
        }
        throw new Error(data?.error || 'Failed to get AI response');
      }

      if (Number.isFinite(Number(data?.meta?.sessionLimit))) {
        setMaxMessages(Number(data.meta.sessionLimit));
      }

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        text: String(data?.answer || 'No response generated.'),
        createdAt: new Date().toISOString(),
        meta: data?.meta,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? 'Request timed out. Please try again or start a new chat.'
        : err instanceof Error
          ? err.message
          : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-xl bg-muted border border-border text-gray-400 hover:text-white transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#10b981]" />
              AI Chat
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Reads stock + chat memory from Chroma on every prompt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => deleteSession(sessionId)}
            title="Delete Current Chat"
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={startNewChat}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
      </div>

      {recentSessions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-xs font-medium text-muted-foreground mr-1 whitespace-nowrap">Recent:</span>
          {recentSessions.map((s, i) => {
            const num = recentSessions.length - i;
            return (
              <button
                key={s.id}
                onClick={() => switchChat(s.id)}
                className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all border ${
                  s.id === sessionId 
                    ? 'bg-primary text-primary-foreground border-primary font-medium' 
                    : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Chat {num}
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div ref={listRef} className="h-[60vh] overflow-y-auto p-4 space-y-3">
          {historyLoading && (
            <div className="rounded-xl border border-border bg-card p-3 text-xs text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading previous chats...
            </div>
          )}

          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card p-3 text-sm text-gray-300">
                Ask anything about your market feed. I’ll use database context from Chroma before answering.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendPrompt(s)}
                    className="text-left rounded-xl border border-border bg-card px-3 py-2 text-xs text-gray-400 hover:text-white hover:border-border transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const user = m.role === 'user';
            return (
              <div key={m.id} className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed border ${
                    user
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-200'
                      : 'bg-muted border-border text-foreground'
                  }`}
                >
                  <div className="whitespace-pre-wrap"><FormattedText text={m.text} /></div>

                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-2.5 text-sm border bg-muted border-border text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking with DB context...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3.5 space-y-2">
          {limitReached && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-300">This chat reached its limit. Start a new chat to continue.</p>
              <button
                onClick={startNewChat}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-400 text-black hover:bg-amber-300 transition-all"
              >
                New Chat
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendPrompt();
                }
              }}
              placeholder="Ask about stocks, sectors, or trends..."
              className="min-h-11.5 max-h-40 resize-y flex-1 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:border-primary/40"
            />
            <button
              onClick={() => sendPrompt()}
              disabled={!canSend}
              className="h-11.5 px-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
