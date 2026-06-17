import Anthropic from '@anthropic-ai/sdk';
import { MODELS } from '@/config/models';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const VALIDATION_MODEL = MODELS.haiku;

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const VALIDATION_TABLE = 'ValidationLog';

export interface ValidationResult {
  valid: boolean;
  flags: string[];
  confidence: 'high' | 'medium' | 'low';
  safeguardedResponse: string;
}

const VALIDATOR_RULES = `Keep each flag to one short sentence. Maximum 3 flags. For safeguarded_response: if no flags, use "". If flags exist, write a brief corrected summary under 200 characters — do NOT echo the full input back.
Return ONLY valid JSON, no markdown, no explanation: {"valid": boolean, "flags": [], "confidence": "high"|"medium"|"low", "safeguarded_response": ""}`;

const TOOL_PROMPTS: Record<string, string> = {
  health: `Review this health insurance recommendation.
Flag if: (1) a specific plan is called definitively 'best' without qualification, (2) any medical advice is given about specific conditions or medications, (3) recommendation contradicts the user's stated cash flow comfort level.
Do NOT flag dollar amounts for subsidies or premiums — those are intentionally deferred to plan cards.
${VALIDATOR_RULES}`,

  childcare: `Review this childcare recommendation.
Flag if: (1) specific subsidy dollar amounts appear that weren't in the calculation data, (2) any provider-specific claims beyond name/address/rating from Google Places, (3) income eligibility stated as definitive fact rather than estimate.
${VALIDATOR_RULES}`,

  media: `Review this children's media recommendation.
Flag if: (1) a show or game is recommended that you cannot confidently identify as real, (2) age recommendations are more specific than the input data supports, (3) any claim about developmental impact stated as clinical fact rather than general guidance.
Set confidence to: high if you can clearly identify all recommended content, medium if uncertain about any item, low if any item seems potentially invented.
${VALIDATOR_RULES}`,

  meal: `Review this meal plan recommendation.
Flag if: (1) specific nutrition numbers are stated as fact (e.g. '32g of protein'), (2) any allergen the user flagged appears in recommended meals, (3) any medical nutrition claim is made.
${VALIDATOR_RULES}`,
};

async function logToAirtable(
  tool: string,
  flags: string[],
  confidence: string,
  wasOverridden: boolean,
  inputSummary: string,
): Promise<void> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[Validation] Airtable credentials missing — skipping log');
    return;
  }

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(VALIDATION_TABLE)}`;
    const payload = {
      records: [{
        fields: {
          Tool: tool,
          Flags: flags.join('; '),
          Confidence: confidence,
          WasOverridden: wasOverridden,
          InputSummary: inputSummary.slice(0, 500),
          Timestamp: new Date().toISOString().split('T')[0],
        },
      }],
    };

    console.log('[Validation] Writing to Airtable table:', VALIDATION_TABLE);
    console.log('[Validation] Payload:', JSON.stringify(payload));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log('[Validation] AIRTABLE WRITE ATTEMPTED — status:', res.status, 'ok:', res.ok, 'body:', JSON.stringify(data));
    if (!res.ok) {
      console.error('[Validation] Airtable log FAILED:', res.status, JSON.stringify(data));
    }
  } catch (err) {
    console.error('[Validation] Airtable log fetch error:', err);
  }
}

export async function validateRecommendation(
  toolName: string,
  rawOutput: string,
  userInputsSummary: string,
): Promise<ValidationResult> {
  const defaultResult: ValidationResult = {
    valid: true,
    flags: [],
    confidence: 'medium',
    safeguardedResponse: rawOutput,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Validation] No ANTHROPIC_API_KEY — skipping validation for:', toolName);
    return defaultResult;
  }

  const systemPrompt = TOOL_PROMPTS[toolName];
  if (!systemPrompt) {
    console.log('[Validation] No prompt for tool:', toolName);
    return defaultResult;
  }

  console.log('[Validation] Calling validator for:', toolName);

  try {
    const message = await anthropic.messages.create({
      model: VALIDATION_MODEL,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `${systemPrompt}\n\nUser inputs summary: ${userInputsSummary}\n\nContent to review:\n${rawOutput}`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) return defaultResult;

    try {
      const cleaned = textBlock.text
        .replace(/^```json\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/```\s*$/im, '')
        .trim();
      const parsed = JSON.parse(cleaned) as {
        valid: boolean;
        flags: string[];
        confidence: 'high' | 'medium' | 'low';
        safeguarded_response: string;
      };

      const SAFE_FALLBACKS: Record<string, string> = {
        health: 'Based on your profile, we recommend exploring ACA Marketplace plans for your situation. Please see the plan cards below for cost estimates, and verify details at Healthcare.gov before enrolling.',
        childcare: 'Based on your family profile, there are savings programs that may help reduce your childcare costs. See the results below for providers near you and estimated savings.',
        media: 'We have recommendations for age-appropriate content for your child. Please review the picks below and verify availability on each platform.',
        meal: 'Your personalized meal plan is ready below. Please verify ingredients against your family\'s specific allergies before preparing any meals.',
      };

      const hasFlags = parsed.flags && parsed.flags.length > 0;
      let safeguardedResponse = rawOutput;
      if (hasFlags) {
        safeguardedResponse = parsed.safeguarded_response && parsed.safeguarded_response.trim().length > 0
          ? parsed.safeguarded_response
          : SAFE_FALLBACKS[toolName] || rawOutput;
      }

      const result: ValidationResult = {
        valid: parsed.valid,
        flags: parsed.flags || [],
        confidence: parsed.confidence || 'medium',
        safeguardedResponse,
      };

      // Log if flags were found
      if (result.flags.length > 0) {
        console.log('[Validation]', toolName, 'flags:', result.flags);
        logToAirtable(
          toolName,
          result.flags,
          result.confidence,
          result.safeguardedResponse !== rawOutput,
          userInputsSummary,
        ).catch(() => {});
      }

      return result;
    } catch {
      console.error('[Validation] Failed to parse validation response');
      return defaultResult;
    }
  } catch (err) {
    console.error('[Validation] Validation call failed:', err);
    return defaultResult;
  }
}
