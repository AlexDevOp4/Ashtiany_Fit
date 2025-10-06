// netlify/functions/submission-created.js
// Netlify Forms event function: runs on every form submission.
// Requires Node 18+ on Netlify (default). Uses built-in fetch.

// ENV VARS (Netlify → Site settings → Environment variables):
// AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME
// POSTMARK_TOKEN, SALES_EMAIL, CALENDLY_LINK (optional)
require("dotenv").config();


const AIRTABLE_API = "https://api.airtable.com/v0";
const POSTMARK_API = "https://api.postmarkapp.com/email";

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const data = body?.payload?.data || {};
    const formName = body?.payload?.form_name || "";

    // Only handle our form
    if (formName !== "consultation") return ok("Ignored other form");

    // —— Server-side anti-spam ——
    if (data.company && String(data.company).trim() !== "")
      return ok("Honeypot");
    const ttc = Number(data.time_to_complete || 0);
    if (isFinite(ttc) && ttc < 5000) return ok("Too fast");

    // If you kept the math challenge client-side
    if (
      data.challenge &&
      data.challenge_answer &&
      String(data.challenge) !== String(data.challenge_answer)
    ) {
      return ok("Bad challenge");
    }

    // —— Normalize payload ——
    const lead = {
      firstName: (data.firstName || "").trim(),
      lastName: (data.lastName || "").trim(),
      email: (data.email || "").trim().toLowerCase(),
      interest: (data.interest || "").trim(),
      bestTime: (data.bestTime || "").trim(),
      goals: (data.goals || "").trim(),
      consent: String(data.consent || "") === "on" ? "yes" : "no",

      utm_source: (data.utm_source || "").trim(),
      utm_medium: (data.utm_medium || "").trim(),
      utm_campaign: (data.utm_campaign || "").trim(),
      utm_term: (data.utm_term || "").trim(),
      utm_content: (data.utm_content || "").trim(),
      referrer: (data.referrer || "").trim(),
      landing_path: (data.landing_path || "").trim(),
      device: (data.device || "").trim(),
      time_to_complete: ttc,
    };

    // —— Lead scoring ——
    let score = 0;
    if (lead.goals.split(/\s+/).length >= 30) score += 2;
    if (ttc >= 15000) score += 2;
    if (lead.utm_source) score += 1;
    if (/virtual|hybrid/i.test(lead.interest)) score += 1;
    if (!lead.email || /@(example|test)\./.test(lead.email)) score -= 2;

    // —— Persist to Airtable ——
    await putInAirtable(lead, score);

    // —— Notify you + confirm to the lead ——
    await Promise.all([notifyOwner(lead, score), confirmLead(lead)]);

    return ok("Processed");
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
};

function ok(message) {
  return { statusCode: 200, body: JSON.stringify({ ok: true, message }) };
}

// ————— Integrations —————
async function putInAirtable(lead, score) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;
  if (!token || !base || !table) return;

  const payload = {
    records: [
      {
        fields: {
          Status: "New",
          Score: score,
          "First Name": lead.firstName,
          "Last Name": lead.lastName,
          Email: lead.email,
          Interest: lead.interest,
          "Best Time": lead.bestTime,
          Goals: lead.goals,
          Consent: lead.consent,
          "UTM Source": lead.utm_source,
          "UTM Medium": lead.utm_medium,
          "UTM Campaign": lead.utm_campaign,
          "UTM Term": lead.utm_term,
          "UTM Content": lead.utm_content,
          Referrer: lead.referrer,
          "Landing Path": lead.landing_path,
          Device: lead.device,
          "Time to Complete (ms)": lead.time_to_complete,
          "Submitted At": new Date().toISOString(),
        },
      },
    ],
  };

  const res = await fetch(
    `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`Airtable: ${res.status} ${await res.text()}`);
}

async function notifyOwner(lead, score) {
  const token = process.env.POSTMARK_TOKEN;
  const to = process.env.SALES_EMAIL;
  if (!token || !to) return;

  const html = `
    <h2>New Lead — Ashtiany Fitness</h2>
    <p><strong>${esc(lead.firstName)} ${esc(lead.lastName)}</strong> (${esc(lead.email)})</p>
    <p><strong>Interest:</strong> ${esc(lead.interest)}<br/>
       <strong>Best time:</strong> ${esc(lead.bestTime)}<br/>
       <strong>Score:</strong> ${score}</p>
    <p><strong>Goals:</strong><br/>${nl2br(esc(lead.goals))}</p>
    <hr/>
    <p><strong>UTM:</strong> ${esc(lead.utm_source || "-")}/${esc(lead.utm_medium || "-")}/${esc(lead.utm_campaign || "-")}<br/>
       <strong>Referrer:</strong> ${esc(lead.referrer || "-")}<br/>
       <strong>Path:</strong> ${esc(lead.landing_path || "-")}<br/>
       <strong>Device:</strong> ${esc(lead.device || "-")}<br/>
       <strong>TTC:</strong> ${Number(lead.time_to_complete) || 0} ms</p>
  `;

  const res = await fetch(POSTMARK_API, {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: to,
      To: to,
      Subject: `New Lead: ${lead.firstName} ${lead.lastName} (${lead.interest}) — Score ${score}`,
      HtmlBody: html,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok)
    throw new Error(`Postmark(owner): ${res.status} ${await res.text()}`);
}

async function confirmLead(lead) {
  const token = process.env.POSTMARK_TOKEN;
  const from = process.env.SALES_EMAIL;
  if (!token || !from || !lead.email) return;

  const calendly = process.env.CALENDLY_LINK || "";

  const msg = `
Hi ${lead.firstName || "there"},

Thanks for reaching out to Ashtiany Fitness. I’ll follow up shortly.
To lock a time now, book here: ${calendly || "(add your Calendly link in Netlify env: CALENDLY_LINK)"}

– Alex
`;

  const res = await fetch(POSTMARK_API, {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: from,
      To: lead.email,
      Subject: "Ashtiany Fitness — Consultation Request Received",
      TextBody: msg,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok)
    throw new Error(`Postmark(lead): ${res.status} ${await res.text()}`);
}

// Helpers
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function nl2br(s) {
  return String(s || "").replace(/\n/g, "<br/>");
}
