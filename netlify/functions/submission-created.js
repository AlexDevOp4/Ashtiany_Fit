const POSTMARK_API = "https://api.postmarkapp.com/email";
const AIRTABLE_API = "https://api.airtable.com/v0";
exports.handler = async (event) => {
  try {
    console.log("submission-created LOADED");

    const bodyRaw = event.body || "{}";
    const body = JSON.parse(bodyRaw);
    const data = body?.payload?.data || {};
    const formName = body?.payload?.form_name || "";
    console.log("FORM NAME:", formName);

    // Env check
    const ENV = {
      has_POSTMARK: !!process.env.POSTMARK_TOKEN,
      SALES_EMAIL: process.env.SALES_EMAIL,
      STREAM: "outbound",
    };
    console.log("ENV CHECK:", ENV);

    if (formName !== "consultation") {
      console.log("IGNORED: not our form");
      return ok("Ignored non-consultation form");
    }

    // --- Anti-spam (keep these once working) ---
    const ttc = Number(data.time_to_complete || 0);
    if (data.company && String(data.company).trim() !== "") {
      console.log("HONEYPOT");
      return ok("Honeypot");
    }
    if (isFinite(ttc) && ttc < 5000) {
      console.log("TOO FAST", ttc);
      return ok("Too fast");
    }

    // --- Additional filters ---
    const email = (data.email || "").toLowerCase();
    const badDomains = [
      "bdcimail.com",
      "webmai.co",
      "mailinator.com",
      "tempmail",
      "guerrillamail",
      "10minutemail",
      "sharklasers.com",
      "yopmail.com",
      "dispostable.com",
    ];
    const emailDomain = email.split("@")[1] || "";
    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      badDomains.some((d) => emailDomain.endsWith(d))
    ) {
      console.log("SPAM: bad email", email);
      return ok("Spam filtered (email)");
    }

    const ALLOWED_INTEREST = new Set([
      "Strength Training",
      "Fat Loss",
      "Recomposition",
      "Virtual Coaching",
      "Hybrid Program",
    ]);
    const ALLOWED_TIME = new Set([
      "Early Morning (5–7 AM)",
      "Morning (7–10 AM)",
      "Midday (11 AM–2 PM)",
      "Afternoon (2–5 PM)",
      "Evening (5–8 PM)",
    ]);
    if (
      !ALLOWED_INTEREST.has(data.interest) ||
      !ALLOWED_TIME.has(data.bestTime)
    ) {
      console.log("SPAM: invalid select values", data.interest, data.bestTime);
      return ok("Spam filtered (select)");
    }

    const lead = {
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      email: (data.email || "").toLowerCase(),
      interest: data.interest || "",
      bestTime: data.bestTime || "",
      goals: data.goals || "",
      time_to_complete: ttc,
    };

    // Send owner email (with full diagnostics)
    const result = await sendOwnerEmail(lead);

    // fire-and-forget client confirmation (don't block on failure)
    try {
      await sendClientEmail(lead);
      console.log("CLIENT EMAIL SENT");
    } catch (e) {
      console.error("CLIENT EMAIL FAILED:", e);
    }

    // Airtable insert (non-fatal on failure)
    try {
      const air = await airtableInsert(lead, data);
      console.log("AIRTABLE RESULT:", air);
    } catch (e) {
      console.error("AIRTABLE FAILED:", e);
    }

    console.log("POSTMARK SEND RESULT:", result);

    return ok("Owner email attempted");
  } catch (err) {
    console.error("ERROR in submission-created:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
};

function ok(message) {
  return { statusCode: 200, body: JSON.stringify({ ok: true, message }) };
}

function getDomain(email) {
  return (
    String(email || "")
      .split("@")[1]
      ?.toLowerCase() || ""
  );
}

async function sendClientEmail(lead) {
  const token = process.env.POSTMARK_TOKEN;
  const from = process.env.SALES_EMAIL;
  if (!token) throw new Error("Missing POSTMARK_TOKEN");
  if (!from) throw new Error("Missing SALES_EMAIL");

  // Guard while account pending approval
  const fromDomain = getDomain(from);
  const toDomain = getDomain(lead.email);
  if (fromDomain && toDomain && fromDomain !== toDomain) {
    console.log("CLIENT EMAIL SKIPPED (pending approval domain restriction)", {
      fromDomain,
      toDomain,
    });
    return { skipped: true, reason: "postmark-pending-approval" };
  }

  const first = lead.firstName || "there";

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#0b1324">
      <h2 style="margin:0 0 8px 0">Thanks, ${esc(first)} — we got your request.</h2>
      <p>We’ll email you shortly to schedule your consultation.</p>
      <hr style="border:none;height:1px;background:#e9eef6;margin:16px 0" />
      <p style="margin:0 0 6px 0"><strong>Summary</strong></p>
      <p style="margin:0">Name: ${esc(lead.firstName)} ${esc(lead.lastName)}</p>
      <p style="margin:0">Email: ${esc(lead.email)}</p>
      <p style="margin:0">Interest: ${esc(lead.interest)} | Best time: ${esc(lead.bestTime)}</p>
      <p style="margin:8px 0 0 0"><strong>Context</strong><br>${nl2br(esc(lead.goals || "(none provided)"))}</p>
      <p style="margin-top:16px">— Ashtiany Fitness</p>
    </div>
  `;

  const payload = {
    From: from,
    To: lead.email,
    Subject: `We received your consultation request, ${first}`,
    HtmlBody: html,
    TextBody:
      `Thanks, ${first} — we got your request.\n\n` +
      `Interest: ${lead.interest} | Best time: ${lead.bestTime}\n\n` +
      `Context:\n${lead.goals || "(none provided)"}\n\n` +
      `— Ashtiany Fitness`,
    ReplyTo: from,
    MessageStream: "outbound",
  };

  const res = await fetch(POSTMARK_API, {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Postmark(client) failed: ${res.status} ${text}`);
  return { status: res.status, body: text };
}

async function sendOwnerEmail(lead) {
  const token = process.env.POSTMARK_TOKEN;
  const to = process.env.SALES_EMAIL;

  if (!token) throw new Error("Missing POSTMARK_TOKEN");
  if (!to) throw new Error("Missing SALES_EMAIL");

  const html = `
    <h3>New Lead — Ashtiany Fitness</h3>
    <p><strong>${esc(lead.firstName)} ${esc(lead.lastName)}</strong> — ${esc(lead.email)}</p>
    <p><strong>Interest:</strong> ${esc(lead.interest)} &nbsp;|&nbsp; <strong>Best time:</strong> ${esc(lead.bestTime)}</p>
    <p><strong>Context (goals, constraints, timeline):</strong><br>${nl2br(esc(lead.goals || "(none provided)"))}</p>
    <p><strong>TTC:</strong> ${Number(lead.time_to_complete) || 0} ms</p>
  `;

  const payload = {
    From: to, // MUST be a verified sender/domain in Postmark
    To: to,
    Subject: `New Lead: ${lead.firstName} ${lead.lastName} — ${lead.interest}`,
    HtmlBody: html,
    TextBody:
      `New Lead — Ashtiany Fitness\n` +
      `${lead.firstName} ${lead.lastName} — ${lead.email}\n` +
      `Interest: ${lead.interest} | Best time: ${lead.bestTime}\n` +
      `Context:\n${lead.goals || "(none provided)"}\n` +
      `TTC: ${Number(lead.time_to_complete) || 0} ms`,
    ReplyTo: lead.email, // lets you reply straight to the lead
    MessageStream: "outbound", // MUST match your transactional stream
  };

  console.log("POSTMARK REQUEST:", {
    to: payload.To,
    from: payload.From,
    subject: payload.Subject,
    stream: payload.MessageStream,
  });

  const res = await fetch(POSTMARK_API, {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("POSTMARK ERROR:", res.status, text);
    throw new Error(`Postmark failed: ${res.status} ${text}`);
  }
  return { status: res.status, body: text };
}

async function airtableInsert(lead, raw) {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;
  if (!token || !base || !table) throw new Error("Missing Airtable env");

  const url = `${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  console.log("AIRTABLE URL:", url);

  const fields = {
    "First Name": lead.firstName,
    "Last Name": lead.lastName,
    Email: lead.email,
    Interest: lead.interest,
    "Best Time": lead.bestTime,
    Goals: lead.goals,
    "TTC (ms)": Number(lead.time_to_complete) || 0,
    Referrer: raw.referrer || "",
    "Landing Path": raw.landing_path || "",
    Device: raw.device || "",
    utm_source: raw.utm_source || "",
    utm_medium: raw.utm_medium || "",
    utm_campaign: raw.utm_campaign || "",
    utm_term: raw.utm_term || "",
    utm_content: raw.utm_content || "",
  };

  const probe = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}?maxRecords=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  console.log("AIRTABLE PROBE:", probe.status, await probe.text());

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("AIRTABLE ERROR:", res.status, text);
    throw new Error(`Airtable ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function nl2br(s) {
  return String(s || "").replace(/\n/g, "<br/>");
}
