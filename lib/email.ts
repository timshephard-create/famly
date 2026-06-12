import { PLATFORM, TOOLS, type ToolId } from '@/config/platform';

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || PLATFORM.email.fromEmail;
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || PLATFORM.email.fromName;

const SITE_URL = 'https://kindora.world';
const BRAND_COLOR = '#0E6B43';

export interface EmailResultsData {
  // Sprout
  savingsTotal?: number;
  ccdf?: number;
  fsa?: number;
  ctc?: number;
  income?: string;
  isGapMode?: boolean;
  // HealthGuide
  topPlanName?: string;
  topPlanWhy?: string;
  topWatchOut?: string;
  employerCoverage?: string;
  // BrightWatch
  childAge?: string;
  context?: string;
  recommendations?: Array<{ name: string; platform: string; score: number; why: string }>;
  avoid?: string;
  // Nourish
  weeklyTotal?: string;
  topDinners?: Array<{ name: string; prepTime: string; cost: string }>;
  topSavingsTip?: string;
}

export async function sendWelcomeEmail(
  name: string,
  email: string,
  toolId: string,
  results?: EmailResultsData,
): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.warn('[Brevo] Missing API key — skipping email');
    return false;
  }

  const tool = TOOLS[toolId as ToolId];
  if (!tool) return false;

  const subject = tool.emailSubject;
  const htmlContent = buildEmailHtml(name, toolId as ToolId, results);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email, name }],
        subject,
        htmlContent,
      }),
    });

    console.log('[Brevo] Send response status:', res.status);
    return res.ok;
  } catch (err) {
    console.error('[Brevo] Failed to send email:', err);
    return false;
  }
}

export interface TicketNotificationData {
  ticketId: string;
  description: string;
  email?: string;
  page?: string;
  tool?: string;
  appVersion?: string;
}

const SUPPORT_NOTIFY_EMAIL = process.env.SUPPORT_NOTIFY_EMAIL || 'tim@kindora.world';

/** Transactional notification to the founder when a support ticket lands. */
export async function sendTicketNotification(data: TicketNotificationData): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.warn('[Brevo] Missing API key — skipping ticket notification');
    return false;
  }

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const htmlContent = `
    <div style="font-family: Inter, sans-serif; max-width: 560px;">
      <h2 style="color: ${BRAND_COLOR};">New support ticket</h2>
      <p style="white-space: pre-wrap;">${esc(data.description)}</p>
      <table style="font-size: 13px; color: #5C6664;">
        <tr><td style="padding-right: 12px;">Ticket</td><td>${esc(data.ticketId)}</td></tr>
        <tr><td>Page</td><td>${esc(data.page || '—')}</td></tr>
        <tr><td>Tool</td><td>${esc(data.tool || '—')}</td></tr>
        <tr><td>Reporter</td><td>${esc(data.email || 'anonymous')}</td></tr>
        <tr><td>App version</td><td>${esc(data.appVersion || '—')}</td></tr>
      </table>
    </div>`;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email: SUPPORT_NOTIFY_EMAIL, name: 'Kindora Support' }],
        replyTo: data.email ? { email: data.email } : undefined,
        subject: `[Support] ${data.tool || 'site'} — ticket ${data.ticketId.slice(0, 8)}`,
        htmlContent,
      }),
    });
    console.log('[Brevo] Ticket notification status:', res.status);
    return res.ok;
  } catch (err) {
    console.error('[Brevo] Failed to send ticket notification:', err);
    return false;
  }
}

// --- Formatting helpers ---

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const INCOME_LABELS: Record<string, string> = {
  under_35k: 'under $35,000',
  '35k_60k': '$35,000\u2013$60,000',
  '60k_90k': '$60,000\u2013$90,000',
  '90k_plus': 'over $90,000',
};

const AGE_LABELS: Record<string, string> = {
  under_12m: 'under 12 months',
  '12_24m': '12\u201324 months',
  '2_3y': '2\u20133 year old',
  '4_5y': '4\u20135 year old',
};

const CONTEXT_LABELS: Record<string, string> = {
  learning: 'learning time',
  wind_down: 'wind-down before bed',
  co_viewing: 'co-viewing with a parent',
  independent: 'independent play',
};

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#6B6B6B;font-size:14px;">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${value}</td></tr>`;
}

function divider(): string {
  return '<div style="border-top:1px solid #E2DAD0;margin:20px 0;"></div>';
}

function premiumCta(): string {
  return `${divider()}
<p style="font-size:14px;line-height:1.6;color:#2C2C2C;">Want to save your results and track your progress over time? Join the Kindora Premium waitlist &mdash; founding members get early access and locked-in pricing.</p>
<div style="text-align:center;margin:16px 0;">
  <a href="${SITE_URL}/waitlist" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;">Join the waitlist &rarr;</a>
</div>`;
}

// --- Per-tool body builders ---

function buildSproutBody(_name: string, r: EmailResultsData): string {
  let html = '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Here&rsquo;s a summary of your childcare results.</p>';

  if (r.savingsTotal && r.savingsTotal > 0) {
    html += `<p style="font-size:15px;line-height:1.6;"><strong>You may qualify for up to ${fmt(r.savingsTotal)}/year</strong> in childcare savings:</p>`;
    html += '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">';
    if (r.ccdf && r.ccdf > 0) html += row('CCDF Subsidy', `${fmt(r.ccdf)}/yr`);
    if (r.fsa && r.fsa > 0) html += row('FSA Savings', `${fmt(r.fsa)}/yr`);
    if (r.ctc && r.ctc > 0) html += row('Child Tax Credit', `${fmt(r.ctc)}/yr`);
    html += '</table>';
  }

  if (r.isGapMode) {
    html += '<p style="font-size:14px;line-height:1.6;color:#6B6B6B;">Based on your needs, we recommend looking into backup care programs and flexible drop-in centers near you.</p>';
  } else {
    const incomeLabel = INCOME_LABELS[r.income || ''] || 'your income level';
    html += `<p style="font-size:14px;line-height:1.6;color:#6B6B6B;">For a household earning ${incomeLabel}, licensed childcare centers and preschool programs near your ZIP are your best bet.</p>`;
  }

  return html;
}

function buildHealthBody(_name: string, r: EmailResultsData): string {
  let html = '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Here&rsquo;s a summary of your health coverage analysis.</p>';

  if (r.topPlanName) {
    html += `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">`;
    html += row('Top recommendation', r.topPlanName);
    html += '</table>';
    if (r.topPlanWhy) html += `<p style="font-size:14px;line-height:1.6;color:#6B6B6B;">${r.topPlanWhy}</p>`;
  }

  if (r.topWatchOut) {
    html += `<p style="font-size:14px;line-height:1.6;margin-top:12px;"><strong>One thing to watch:</strong> ${r.topWatchOut}</p>`;
  }

  const isMarketplace = r.employerCoverage === 'none' || r.employerCoverage === 'poor';
  const isMedicaid = r.employerCoverage === 'medicaid';

  html += divider();
  if (isMedicaid) {
    html += '<p style="font-size:14px;line-height:1.6;"><strong>Your next step:</strong> <a href="https://www.medicaid.gov/about-us/beneficiary-resources/index.html" style="color:#2D6280;">Check your Medicaid eligibility</a> and make sure your enrollment is current.</p>';
  } else if (isMarketplace) {
    html += '<p style="font-size:14px;line-height:1.6;"><strong>Your next step:</strong> <a href="https://www.healthcare.gov" style="color:#2D6280;">Browse plans on Healthcare.gov</a> to see your actual premiums and subsidy amount.</p>';
  } else {
    html += '<p style="font-size:14px;line-height:1.6;"><strong>Your next step:</strong> Review your employer&rsquo;s open enrollment options and compare plan tiers.</p>';
  }

  return html;
}

function buildBrightWatchBody(_name: string, r: EmailResultsData): string {
  const ageLabel = AGE_LABELS[r.childAge || ''] || 'your child';
  const contextLabel = CONTEXT_LABELS[r.context || ''] || 'screen time';

  let html = `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">For your ${ageLabel} during ${contextLabel}, here are our top picks:</p>`;

  if (r.recommendations) {
    html += '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">';
    for (const rec of r.recommendations.slice(0, 3)) {
      html += `<tr><td style="padding:8px 0;border-bottom:1px solid #E2DAD0;"><strong>${rec.name}</strong><br/><span style="font-size:13px;color:#6B6B6B;">${rec.platform} &middot; Score: ${rec.score}/100</span><br/><span style="font-size:13px;color:#6B6B6B;">${rec.why}</span></td></tr>`;
    }
    html += '</table>';
  }

  if (r.avoid) {
    html += `<p style="font-size:14px;line-height:1.6;margin-top:12px;"><strong>What to avoid:</strong> ${r.avoid}</p>`;
  }

  return html;
}

function buildNourishBody(_name: string, r: EmailResultsData): string {
  let html = '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Here&rsquo;s a summary of your personalized meal plan.</p>';

  if (r.weeklyTotal) {
    html += `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">`;
    html += row('Estimated weekly cost', r.weeklyTotal);
    html += '</table>';
  }

  if (r.topDinners && r.topDinners.length > 0) {
    html += '<p style="font-size:14px;font-weight:600;margin:12px 0 8px;">Three dinners to look forward to:</p>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    for (const d of r.topDinners.slice(0, 3)) {
      html += `<tr><td style="padding:6px 0;font-size:14px;"><strong>${d.name}</strong></td><td style="padding:6px 0;font-size:13px;color:#6B6B6B;text-align:right;">${d.prepTime} &middot; ${d.cost}/serving</td></tr>`;
    }
    html += '</table>';
  }

  if (r.topSavingsTip) {
    html += `<p style="font-size:14px;line-height:1.6;margin-top:12px;"><strong>Biggest savings tip:</strong> ${r.topSavingsTip}</p>`;
  }

  return html;
}

function buildGenericBody(_name: string, tool: typeof TOOLS[ToolId]): string {
  return `<p style="font-size:15px;line-height:1.6;">Thanks for using <strong>${tool.name}</strong> on ${PLATFORM.name}. Your personalized results were generated based on your answers.</p>`;
}

// --- Main HTML builder ---

function buildEmailHtml(name: string, toolId: ToolId, results?: EmailResultsData): string {
  const tool = TOOLS[toolId];
  let body: string;

  if (results) {
    switch (toolId) {
      case 'childcare': body = buildSproutBody(name, results); break;
      case 'health': body = buildHealthBody(name, results); break;
      case 'media': body = buildBrightWatchBody(name, results); break;
      case 'meal': body = buildNourishBody(name, results); break;
      default: body = buildGenericBody(name, tool);
    }
  } else {
    body = buildGenericBody(name, tool);
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#FAF6F0;font-family:'DM Sans',Arial,sans-serif;color:#2C2C2C;">
  <div style="max-width:600px;margin:0 auto;padding:24px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:16px 0 12px;">
      <span style="font-size:22px;font-weight:700;color:#2C2C2C;letter-spacing:-0.5px;">${PLATFORM.brandName}</span>
    </div>
    <div style="border-top:2px solid #E2DAD0;margin-bottom:24px;"></div>

    <!-- Card -->
    <div style="background:#FFFDF9;border-radius:16px;padding:28px 24px;">
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Hi ${name},</p>
      ${body}
      ${premiumCta()}
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #E2DAD0;margin-top:24px;padding-top:20px;text-align:center;">
      <p style="font-size:14px;color:#2C2C2C;margin:0;">&mdash; Tim</p>
      <p style="font-size:13px;color:#6B6B6B;margin:4px 0;">${PLATFORM.brandName}</p>
      <a href="${SITE_URL}" style="font-size:13px;color:${BRAND_COLOR};text-decoration:none;">${PLATFORM.domain}</a>
      <p style="font-size:11px;color:#999;margin:16px 0 0;">You received this because you used a ${PLATFORM.name} tool. Questions? <a href="mailto:${PLATFORM.email.fromEmail}" style="color:#999;">${PLATFORM.email.fromEmail}</a></p>
    </div>
  </div>
</body>
</html>`;
}
