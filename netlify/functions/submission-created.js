const POSTMARK_API = "https://api.postmarkapp.com/email";
const AIRTABLE_API = "https://api.airtable.com/v0";

exports.handler = async (event) => {
  console.log("submission-created LOADED");

  try {
    const bodyRaw = event.body || "{}";
    console.log("RAW EVENT BODY:", bodyRaw.slice(0, 2000)); // truncate for logs
    const body = JSON.parse(bodyRaw);
    const data = body?.payload?.data || {};
    const formName = body?.payload?.form_name || "";
    console.log("FORM NAME:", formName);
    console.log("ENV CHECK:", {
      has_POSTMARK: !!process.env.POSTMARK_TOKEN,
      SALES_EMAIL: process.env.SALES_EMAIL,
      has_AIRTABLE_TOKEN: !!process.env.AIRTABLE_TOKEN,
      AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
      AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME,
    });

    if (formName !== "consultation") {
      console.log("IGNORED: not our form");
      return ok("Ignored non-consultation form");
    }

    // server-side anti-spam
    const ttc = Number(data.time_to_complete || 0);
    if (data.company && String(data.company).trim() !== "") {
      console.log("HONEYPOT");
      return ok("Honeypot");
    }
    if (isFinite(ttc) && ttc < 5000) {
      console.log("TOO FAST", ttc);
      return ok("Too fast");
    }

    // Minimal send to prove Postmark works from the event
    await sendOwnerEmail({
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      email: (data.email || "").toLowerCase(),
      interest: data.interest || "",
      bestTime: data.bestTime || "",
      goals: data.goals || "",
      time_to_complete: ttc,
    });

    console.log("OWNER EMAIL SENT. Proceed to Airtable next if needed.");
    return ok("Debug: owner email sent");
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

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: to,
      To: to,
      Subject: `New Lead: ${lead.firstName} ${lead.lastName} — ${lead.interest}`,
      HtmlBody: html,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok)
    throw new Error(
      `Postmark(owner) failed: ${res.status} ${await res.text()}`
    );
}

// helpers already in your file; keep them:
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
