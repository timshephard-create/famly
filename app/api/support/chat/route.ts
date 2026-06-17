import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase-server';
import {
  ChatMessage,
  IP_CAP_MESSAGE,
  IP_DAILY_MAX_REQUESTS,
  MAX_MESSAGE_CHARS,
  SESSION_CAP_MESSAGE,
  hashIp,
  isBugReport,
  matchTopicRoute,
  routedRefusal,
  sessionCapped,
} from '@/lib/support-guard';
import { SUPPORT_SYSTEM_PROMPT } from '@/lib/support-kb';
import { MODELS } from '@/config/models';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(60),
  page: z.string().max(200).optional(),
});

const FALLBACK_REPLY =
  "Something's off on our end — the support robot needs a minute. Try again in a sec, " +
  'or tap "Report an issue" and Tim will follow up directly.';

async function ipCapExceeded(req: NextRequest): Promise<boolean> {
  const supabase = getSupabaseServer();
  if (!supabase) return false; // fail open: support stays available, cap is best-effort
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  try {
    const { data, error } = await supabase.rpc('increment_support_usage', {
      p_ip_hash: await hashIp(ip),
    });
    if (error) {
      console.warn('[Support] usage increment failed:', error.message);
      return false;
    }
    return typeof data === 'number' && data > IP_DAILY_MAX_REQUESTS;
  } catch (err) {
    console.warn('[Support] usage check failed:', err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const messages = body.messages as ChatMessage[];
  const latest = messages[messages.length - 1];
  if (latest.role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from the user' }, { status: 400 });
  }

  // Cost ceilings — deterministic, pre-LLM. Support is free, never metered;
  // these caps are purely an API cost ceiling.
  if (sessionCapped(messages)) {
    return NextResponse.json({ reply: SESSION_CAP_MESSAGE, capped: 'session' });
  }
  if (await ipCapExceeded(req)) {
    return NextResponse.json({ reply: IP_CAP_MESSAGE, capped: 'ip' }, { status: 429 });
  }

  // Hard scoping — domain-substance questions are refused-and-routed in
  // code, before the model ever sees them.
  const route = matchTopicRoute(latest.content);
  if (route) {
    return NextResponse.json({ reply: routedRefusal(route), routed: route.tool });
  }

  const escalate = isBugReport(latest.content);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: FALLBACK_REPLY, escalate });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODELS.haiku,
      max_tokens: 400,
      temperature: 0.2,
      system: SUPPORT_SYSTEM_PROMPT,
      messages: messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    const reply = textBlock && 'text' in textBlock ? textBlock.text : FALLBACK_REPLY;
    return NextResponse.json({ reply, escalate });
  } catch (err) {
    console.error('[Support] chat error:', err);
    return NextResponse.json({ reply: FALLBACK_REPLY, escalate });
  }
}
