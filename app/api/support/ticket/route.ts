import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase-server';
import { sendTicketNotification } from '@/lib/email';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0-prelaunch';

const bodySchema = z.object({
  description: z.string().min(10).max(4000),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  page: z.string().max(200).optional(),
  tool: z.string().max(40).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(60)
    .optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Support tickets are temporarily unavailable' },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      description: body.description,
      email: body.email || null,
      page_path: body.page || null,
      tool: body.tool || null,
      app_version: APP_VERSION,
      transcript: body.transcript || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Support] ticket insert failed:', error.message);
    return NextResponse.json(
      { error: 'Could not save your report — please try again' },
      { status: 500 },
    );
  }

  // Notification failure must never fail ticket creation.
  try {
    await sendTicketNotification({
      ticketId: data.id,
      description: body.description,
      email: body.email || undefined,
      page: body.page,
      tool: body.tool,
      appVersion: APP_VERSION,
    });
  } catch (err) {
    console.error('[Support] ticket notification failed:', err);
  }

  return NextResponse.json({ ok: true, ticketId: data.id });
}
