// Live year
document.getElementById("year").textContent = new Date().getFullYear();

(function () {
  const form = document.querySelector('form[name="consultation"]');
  const backdrop = document.getElementById("thankyou-backdrop");
  const closeBtn = document.getElementById("thanks-close");
  const thanksBody = document.getElementById("thanks-body");

  // UTM / context
  const p = new URLSearchParams(location.search);
  const set = (n, v) => {
    const el = document.querySelector(`input[name="${n}"]`);
    if (el) el.value = v || "";
  };
  set("utm_source", p.get("utm_source"));
  set("utm_medium", p.get("utm_medium"));
  set("utm_campaign", p.get("utm_campaign"));
  set("utm_term", p.get("utm_term"));
  set("utm_content", p.get("utm_content"));
  set("referrer", document.referrer);
  set("landing_path", location.pathname);
  set("device", navigator.userAgent);

  // Time-to-complete
  const t0 = Date.now();
  const ttc = document.getElementById("time_to_complete");

  // Modal helpers
  const openModal = (text) => {
    thanksBody.textContent = text;
    backdrop.classList.remove("hidden");
    backdrop.classList.add("flex");
  };
  const closeModal = () => {
    backdrop.classList.add("hidden");
    backdrop.classList.remove("flex");
  };
  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  // Submit
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ttc) ttc.value = String(Date.now() - t0);

    // Basic anti-bot timing
    const tooFast = (Number(ttc?.value) || 0) < 5000;
    if (tooFast) {
      alert("Form submitted too fast. Please try again.");
      return;
    }
    if (!form.reportValidity()) return;

    // Serialize and POST — Netlify Forms compatible
    const data = new FormData(form);
    const body = new URLSearchParams();
    for (const [k, v] of data.entries()) body.append(k, v);

    try {
      const res = await fetch("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        body: body.toString(),
      });
      if (res.ok) {
        const first = (
          document.getElementById("firstName")?.value || ""
        ).trim();
        const last = (document.getElementById("lastName")?.value || "").trim();
        openModal(
          `Thank you for reaching out ${first} ${last}, we'll contact you shortly!`
        );
        form.reset();
      } else {
        alert("Submission error. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    }
  });
})();

// Dynamic honeypot naming to avoid autofill and basic bots
(function () {
  var key = "hp_" + Math.random().toString(36).slice(2);
  var hpKey = document.getElementById("hp_key");
  var hpField = document.getElementById("hp_field");
  if (hpKey && hpField) {
    hpKey.value = key;
    hpField.setAttribute("name", key);
  }
})();

// Mobile nav toggle (drop once per page)
(function () {
  const btn = document.getElementById("nav-toggle");
  const menu = document.getElementById("mobile-menu");
  const openI = document.getElementById("icon-open");
  const closeI = document.getElementById("icon-close");
  if (!btn || !menu) return;
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("hidden", expanded);
    openI.classList.toggle("hidden", !expanded);
    closeI.classList.toggle("hidden", expanded);
  });
})();
