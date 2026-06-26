import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolId } from '@/config/platform';

/**
 * Last-result-per-tool recall (Phase 5, Item 1, FREE tier). One row per
 * (user, tool) via unique(user_id, tool) + upsert — exactly the most recent
 * result, no history. RLS-enforced via the publishable-key client; no-ops when
 * signed out. payload is the tool's own serializable result snapshot.
 */

export async function saveLastResult(
  supabase: SupabaseClient,
  tool: ToolId,
  payload: unknown,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('tool_results')
    .upsert({ user_id: user.id, tool, payload }, { onConflict: 'user_id,tool' });
}

export async function getLastResult<T>(supabase: SupabaseClient, tool: ToolId): Promise<T | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tool_results')
    .select('payload')
    .eq('user_id', user.id)
    .eq('tool', tool)
    .maybeSingle();

  if (error || !data) return null;
  return (data.payload as T) ?? null;
}
