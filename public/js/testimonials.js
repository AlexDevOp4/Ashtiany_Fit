// Replace text with client-approved quotes. Do NOT copy Yelp verbatim.
const slides = [
  {
    name: "Brent D.",
    location: "Falls Church, VA",
    rating: 5,
    quote:
      "Alex rebuilt my squat and deadlift, dialed my nutrition, and pushed my weekly training. Stronger, leaner, better movement.",
  },
  {
    name: "Amber F.",
    location: "Fairfax, VA",
    rating: 5,
    quote:
      "New to training and nervous. He welcomed me, customized the plan to my schedule, and kept me accountable. Real progress.",
  },
  {
    name: "Eric R.",
    location: "Fairfax, VA",
    rating: 5,
    quote:
      "Passionate coach who listens. Programming matched my needs and exceeded expectations. Results delivered.",
  },
  {
    name: "Jonathan L.",
    location: "Arlington, VA",
    rating: 5,
    quote:
      "Best investment I’ve made. Eight months in and the transformation is obvious. Smart, structured, sustainable.",
  },
  {
    name: "Bobby J.",
    location: "McLean, VA",
    rating: 5,
    quote:
      "He taught me proper barbell technique and cleaned up my diet. Down pounds, up confidence.",
  },
];

const track = document.getElementById("t-track");
const dotsWrap = document.getElementById("t-dots");
const btnPrev = document.getElementById("t-prev");
const btnNext = document.getElementById("t-next");

const star =
  '<svg class="h-4 w-4 fill-blue-600" viewBox="0 0 20 20"><path d="M10 15.27 16.18 19l-1.64-7.03L19 7.24l-7.19-.61L10 0 8.19 6.63 1 7.24l4.46 4.73L3.82 19z"/></svg>';

// build slides
const slideEls = slides.map((s, i) => {
  const el = document.createElement("article");
  el.className = "p-5 sm:p-6 transition-opacity duration-300";
  el.setAttribute("role", "group");
  el.setAttribute("aria-roledescription", "slide");
  el.setAttribute("aria-label", `${i + 1} of ${slides.length}`);
  el.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-blue-600/10 grid place-items-center font-bold text-blue-700">
            ${s.name
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div>
            <div class="font-semibold">${s.name}</div>
            <div class="text-xs text-slate-500">${s.location}</div>
          </div>
          <div class="ml-auto flex">${star.repeat(s.rating)}</div>
        </div>
        <p class="mt-3 text-slate-700">${s.quote}</p>
      `;
  return el;
});

// Only show one slide at a time
let index = 0,
  timer;
function render() {
  track.innerHTML = "";
  track.appendChild(slideEls[index]);
  [...dotsWrap.children].forEach((d, i) => {
    d.className =
      "h-2.5 w-2.5 rounded-full " +
      (i === index ? "bg-blue-600" : "bg-slate-300 hover:bg-slate-400");
    d.setAttribute("aria-current", i === index ? "true" : "false");
  });
}

// dots
slides.forEach((_, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "h-2.5 w-2.5 rounded-full bg-slate-300";
  b.addEventListener("click", () => {
    index = i;
    restart();
  });
  dotsWrap.appendChild(b);
});

function next() {
  index = (index + 1) % slides.length;
  render();
}
function prev() {
  index = (index - 1 + slides.length) % slides.length;
  render();
}

btnNext.addEventListener("click", () => {
  next();
  restart(false);
});
btnPrev.addEventListener("click", () => {
  prev();
  restart(false);
});

// keyboard support
track.tabIndex = 0;
track.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") {
    next();
    restart(false);
  }
  if (e.key === "ArrowLeft") {
    prev();
    restart(false);
  }
});

function autoplay() {
  timer = setInterval(next, 6000);
}
function stop() {
  clearInterval(timer);
}
function restart(auto = true) {
  stop();
  render();
  if (auto) autoplay();
}

// pause on hover/focus
track.addEventListener("mouseenter", stop);
track.addEventListener("mouseleave", autoplay);
track.addEventListener("focusin", stop);
track.addEventListener("focusout", autoplay);

// init
render();
autoplay();
