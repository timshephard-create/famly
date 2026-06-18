import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { brightwatchInputSchema } from '@/lib/validations';
import { validateRecommendation } from '@/lib/validate-ai-output';
import { MODELS } from '@/config/models';
import { getActor } from '@/lib/actor';
import { logUsage } from '@/lib/usage-log';
import { checkRateLimit, checkSpendCeiling, HIGH_DEMAND_MESSAGE } from '@/lib/spend-guard';
import type { BrightWatchResponse } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

function buildFallback(age: string, context: string, medium: string): BrightWatchResponse {
  const isTV = medium === 'tv' || medium === 'both';
  const isApps = medium === 'apps' || medium === 'both';

  const recs: BrightWatchResponse['recommendations'] = [];

  if (isTV) {
    recs.push({
      name: 'Bluey',
      type: 'TV Show',
      platform: 'Disney+',
      score: 92,
      stimulation: 'Medium',
      why: 'Models creative play, problem-solving, and family dynamics in episodes that respect both kids and parents.',
      tip: 'After watching, try acting out one of the games Bluey plays — it extends the learning.',
    });
    recs.push({
      name: 'Daniel Tiger\'s Neighborhood',
      type: 'TV Show',
      platform: 'PBS Kids',
      score: 88,
      stimulation: 'Low',
      why: 'Uses music-based strategies to teach emotional regulation — perfect for young children developing social skills.',
      tip: 'Learn the songs together and use them during real moments (e.g., "When you feel so mad that you want to roar...").',
    });
  }

  if (isApps) {
    recs.push({
      name: 'Khan Academy Kids',
      type: 'App',
      platform: 'iOS / Android (Free)',
      score: 90,
      stimulation: 'Medium',
      why: 'Research-backed learning activities that adapt to your child\'s level. Covers reading, math, and social-emotional skills.',
      tip: 'Sit with your child for the first session to see what they gravitate toward — then let them explore independently.',
    });
  }

  recs.push({
    name: 'Sesame Street',
    type: 'TV Show',
    platform: 'PBS / HBO Max',
    score: 86,
    stimulation: 'Medium',
    why: 'Decades of research behind its curriculum. Teaches literacy, numeracy, and kindness through characters kids love.',
    tip: 'Ask your child to teach you what Elmo learned today — narrating reinforces memory.',
  });

  const contextTip = context === 'wind_down'
    ? 'For wind-down time, favor slower-paced content with gentle music and minimal scene changes.'
    : context === 'learning'
      ? 'For learning time, look for shows that pause for the child to respond — interactive formats boost retention.'
      : 'For co-viewing, choose content you both enjoy — your engagement signals to your child that this content matters.';

  return {
    insight: `For a child aged ${age}, ${contextTip} The key is matching content pacing and complexity to your child's developmental stage.`,
    recommendations: recs.slice(0, 4),
    avoid: `Avoid content with rapid scene changes (under 3 seconds per shot), aggressive humor, or apps that rely on extrinsic rewards (stickers/points) rather than intrinsic learning motivation. For this age group, passive scrolling content like YouTube autoplay is particularly risky.`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = brightwatchInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { age, context, medium } = parsed.data;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ data: buildFallback(age, context, medium) });
    }

    // §4 protection: rate limit + spend ceiling before the paid call.
    const actor = await getActor(request);
    const rate = await checkRateLimit(actor.key);
    if (!rate.allowed) {
      return NextResponse.json({ error: HIGH_DEMAND_MESSAGE }, { status: 429 });
    }
    const ceiling = await checkSpendCeiling('media');
    if (!ceiling.allowed) {
      return NextResponse.json({ data: { ...buildFallback(age, context, medium), degraded: true } });
    }

    const prompt = `You are a child development media specialist. Analyze content for a child aged ${age} in a "${context}" context, looking at "${medium}" content.

Return ONLY valid JSON (no markdown, no code fences) in this exact structure:
{
  "insight": "2 sentences on developmentally appropriate content for this age/context",
  "recommendations": [
    {
      "name": "string (real show/app name)",
      "type": "TV Show|App|Game",
      "platform": "string",
      "score": number (60-95),
      "stimulation": "Low|Medium|High",
      "why": "1-2 sentences developmental benefit for this specific age",
      "tip": "One specific parent engagement tip",
      "viewing_type": "together|independent|either"
    }
  ],
  "avoid": "2 sentences on what to avoid for this age/context and why"
}

Give exactly 4 recommendations using real, well-known shows/apps. Use accurate platform info. Scores should reflect genuine developmental value.

For each recommendation, include a "viewing_type" field: "together" if the content benefits from co-viewing and discussion, "independent" if appropriate for the child to watch/use alone, or "either" if both work well.

For each recommendation, if you have any uncertainty about whether this content is currently available on the platform you're listing, flag it by adding "(verify availability)" after the platform name. Also note if a show may have been removed or moved to a different service since your training data.`;

    const message = await anthropic.messages.create({
      // FLAG: BrightWatch stays on Sonnet in this hotfix to preserve current
      // behavior. Brand spec §10 calls for Haiku here — that cost re-tier is a
      // deliberate, separate decision, intentionally NOT made in this hotfix.
      model: MODELS.sonnet,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    logUsage({ tool: 'media', model: MODELS.sonnet, usage: message.usage, userId: actor.userId, ipHash: actor.ipHash });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) {
      return NextResponse.json({ data: buildFallback(age, context, medium) });
    }

    try {
      const parsed = JSON.parse(textBlock.text) as BrightWatchResponse;

      // Validate AI output
      const validation = await validateRecommendation('media', textBlock.text, `age: ${age}, context: ${context}, medium: ${medium}`);
      if (validation.flags.length > 0) {
        try {
          const safeguarded = JSON.parse(validation.safeguardedResponse) as BrightWatchResponse;
          return NextResponse.json({ data: safeguarded });
        } catch {
          return NextResponse.json({ data: parsed });
        }
      }

      return NextResponse.json({ data: parsed });
    } catch {
      return NextResponse.json({ data: buildFallback(age, context, medium) });
    }
  } catch (err) {
    console.error('[API /brightwatch] Error:', err);
    return NextResponse.json({
      data: buildFallback('2-3 years', 'learning', 'both'),
    });
  }
}
