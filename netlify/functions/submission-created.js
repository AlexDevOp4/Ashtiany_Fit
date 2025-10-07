const POSTMARK_API = "https://api.postmarkapp.com/email";

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

    const lead = {
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      email: (data.email || "").toLowerCase(),
      interest: data.interest || "",
      bestTime: data.bestTime || "",
      goals: data.goals || "",
      time_to_complete: ttc,
    };

    console.log("LEAD:", lead);

    // Send owner email (with full diagnostics)
    const result = await sendOwnerEmail(lead);
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

// --- helpers (single copy) ---
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function nl2br(s) {
  return String(s || "").replace(/\\n/g, "<br/>");
}
