'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { getToolByRoute } from '@/config/platform';

type Message = { role: 'user' | 'assistant'; content: string };

const SUPPRESSED_PATHS = ['/privacy', '/terms'];

const GREETING: Message = {
  role: 'assistant',
  content:
    "Hi! I'm Kindora's support helper. Ask me anything about using the site — and if something's broken, tell me and we'll get it in front of a human.",
};

export default function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'report' | 'reported'>('chat');
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestReport, setSuggestReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportError, setReportError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, mode, open]);

  if (SUPPRESSED_PATHS.some((p) => pathname?.startsWith(p))) return null;

  const toolName = pathname ? getToolByRoute(pathname)?.name : undefined;

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setSending(true);
    trackEvent('support_message_sent', { page: pathname || '' });
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Greeting is local UI, not part of the model conversation
        body: JSON.stringify({ messages: next.slice(1), page: pathname }),
      });
      const data = await res.json();
      const reply =
        data.reply || "Something's off on our end. Try again in a sec — we'll be here.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (data.escalate) setSuggestReport(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Something's off on our end. Try again in a sec — we'll be here.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const submitReport = async () => {
    if (reportText.trim().length < 10) {
      setReportError('Give us a sentence or two so we can chase it down.');
      return;
    }
    setSending(true);
    setReportError('');
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: reportText.trim(),
          email: reportEmail.trim(),
          page: pathname,
          tool: toolName,
          transcript: messages.slice(1),
        }),
      });
      if (!res.ok) throw new Error('ticket failed');
      trackEvent('support_ticket_created', { page: pathname || '' });
      setMode('reported');
    } catch {
      setReportError("Couldn't send that — mind trying again?");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-toast" data-testid="support-widget">
      {open && (
        <div className="mb-3 flex h-[28rem] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between bg-clover px-4 py-3">
            <p className="font-display text-sm font-semibold text-white">
              kindora<span className="text-apricot">.</span> support
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="text-white/80 transition-colors hover:text-white"
            >
              ✕
            </button>
          </div>

          {mode === 'chat' && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug ${
                      m.role === 'user'
                        ? 'ml-auto bg-clover text-white'
                        : 'bg-clover-soft text-ink'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {sending && (
                  <div className="max-w-[85%] rounded-lg bg-clover-soft px-3 py-2 text-sm text-mute">
                    …
                  </div>
                )}
                {suggestReport && (
                  <button
                    onClick={() => setMode('report')}
                    className="w-full rounded-lg border border-clover px-3 py-2 text-sm font-semibold text-clover transition-colors hover:bg-clover-soft"
                  >
                    Report this issue →
                  </button>
                )}
              </div>
              <div className="border-t border-line p-3">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask about using Kindora…"
                    aria-label="Support message"
                    className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-mute/60 focus:border-clover focus:outline-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="rounded-lg bg-clover px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clover-dark disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
                <button
                  onClick={() => setMode('report')}
                  className="mt-2 text-xs font-medium text-mute transition-colors hover:text-clover"
                >
                  Report an issue
                </button>
              </div>
            </>
          )}

          {mode === 'report' && (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <p className="text-sm text-ink">
                Tell us what went sideways. Your current page comes along automatically — a human
                reads every report.
              </p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                placeholder="What happened, and what did you expect?"
                aria-label="Issue description"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-mute/60 focus:border-clover focus:outline-none"
              />
              <input
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder="Email for updates (optional)"
                aria-label="Email for updates"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-mute/60 focus:border-clover focus:outline-none"
              />
              {reportError && <p className="text-xs text-status-error">{reportError}</p>}
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => setMode('chat')}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-mute transition-colors hover:text-ink"
                >
                  Back
                </button>
                <button
                  onClick={submitReport}
                  disabled={sending}
                  className="flex-1 rounded-lg bg-clover px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clover-dark disabled:opacity-40"
                >
                  Send report
                </button>
              </div>
            </div>
          )}

          {mode === 'reported' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="font-display text-lg font-semibold text-clover">Got it. One less tab.</p>
              <p className="text-sm text-mute">
                Your report is in. If you left an email, Tim will follow up there.
              </p>
              <button
                onClick={() => {
                  setMode('chat');
                  setSuggestReport(false);
                  setReportText('');
                }}
                className="mt-2 rounded-lg bg-clover px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clover-dark"
              >
                Back to chat
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => {
          setOpen(!open);
          if (!open) trackEvent('support_opened', { page: pathname || '' });
        }}
        aria-label={open ? 'Close support' : 'Open support chat'}
        data-testid="support-launcher"
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-pill bg-clover text-white shadow-lg transition-colors hover:bg-clover-dark"
      >
        {open ? (
          <span className="text-lg">✕</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 12c0 4.418-4.03 8-9 8-1.02 0-2-.15-2.91-.43L4 21l1.52-3.8C4.57 15.93 4 14.03 4 12c0-4.418 4.03-8 9-8s8 3.582 8 8z"
              fill="currentColor"
            />
            <circle cx="9.5" cy="12" r="1.1" fill="#FBF8F2" />
            <circle cx="13" cy="12" r="1.1" fill="#FBF8F2" />
            <circle cx="16.5" cy="12" r="1.1" fill="#EE9A6A" />
          </svg>
        )}
      </button>
    </div>
  );
}
