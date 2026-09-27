import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import { getAppUrl } from "./config";
import { bindForm } from "./forms";
import { markMarkup } from "./mark";
import { mountMarket } from "./market";
import "./styles/main.css";

const appUrl = getAppUrl();
const year = new Date().getFullYear();

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("#app root missing");
}

root.innerHTML = `
  <div class="page">
    <header class="shell nav">
      <a class="brand" href="#top" aria-label="Töökratt home">
        ${markMarkup()}
        <span class="brand-name">töökratt</span>
      </a>
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-links">
        Menu
      </button>
      <nav id="nav-links" class="nav-links" aria-label="Primary">
        <a href="#who">Who it's for</a>
        <a href="#how">How it works</a>
        <a href="#next">What's next</a>
        <a href="#waitlist">Waitlist</a>
        <a class="btn btn-nav" href="${appUrl}">Open the app</a>
      </nav>
    </header>

    <main id="top">
      <section class="shell hero" aria-labelledby="hero-heading">
        <div class="hero-copy">
          <p class="eyebrow">Job market research · Nordics & Europe</p>
          <h1 id="hero-heading">What does the market actually want?</h1>
          <p class="hero-lede">
            Töökratt reads startup job listings and turns them into something you can reason with.
            Which roles are hiring. Which skills keep showing up. Where. Ask it a question and
            every answer points back to a real posting.
          </p>
          <div class="hero-ctas">
            <a class="btn btn-primary" href="#waitlist">Join the waitlist</a>
            <a class="btn btn-secondary" href="#how">See how it works</a>
          </div>
        </div>
      </section>

      <section id="who" class="shell section" aria-labelledby="who-heading">
        <div class="section-header section-header-left">
          <p class="eyebrow">Who it's for</p>
          <h2 id="who-heading">Deciding what to learn is a bet. Make it with data.</h2>
        </div>
        <div class="persona-grid">
          <article class="persona">
            <p class="persona-num">01</p>
            <h3>Choosing what to study</h3>
            <p>Three years is a long time to find out the market moved. See what employers ask for before you commit.</p>
          </article>
          <article class="persona">
            <p class="persona-num">02</p>
            <h3>Just graduated</h3>
            <p>You have the degree. Which of your skills get you hired? Which ones are missing? Find out from the listings, not from guesses.</p>
          </article>
          <article class="persona">
            <p class="persona-num">03</p>
            <h3>Moving to a new country</h3>
            <p>Is your role in demand where you're going? Check before you sign the lease.</p>
          </article>
          <article class="persona">
            <p class="persona-num">04</p>
            <h3>Changing direction</h3>
            <p>A pivot costs time and money. See where the demand is first. Then decide.</p>
          </article>
        </div>
      </section>

      <section id="how" class="shell section" aria-labelledby="how-heading">
        <div class="split">
          <div class="section-header section-header-left">
            <p class="eyebrow">How it works</p>
            <h2 id="how-heading">Three steps. No magic.</h2>
            <p>Retrieval over real listings, then an answer built only from what came back.</p>
          </div>
          <ol class="steps">
            <li class="step">
              <span class="step-num">01</span>
              <div>
                <h3>Read the market</h3>
                <p>Open roles, pay transparency, internships, and student jobs, by country.</p>
              </div>
            </li>
            <li class="step">
              <span class="step-num">02</span>
              <div>
                <h3>Ask a real question</h3>
                <p>Something a filter can't phrase. What do founding engineers in Finland need to know? The answer is built from the listings it retrieved.</p>
              </div>
            </li>
            <li class="step">
              <span class="step-num">03</span>
              <div>
                <h3>Check the source</h3>
                <p>Every claim links to the posting it came from. Not enough data? Töökratt says so. It doesn't guess.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="market" class="band band-ink" aria-labelledby="market-heading">
        <div class="shell">
          <div class="section-header section-header-left">
            <p class="eyebrow">The market view</p>
            <h2 id="market-heading">Pick a country. See the numbers.</h2>
            <p>
              Open roles, roles that publish pay, internships, and student jobs.
              Denmark, Sweden, Norway, Finland, Iceland, Europe.
            </p>
          </div>
          <div class="market-figures" data-market-figures hidden></div>
        </div>
      </section>

      <section id="isnt" class="shell section" aria-labelledby="isnt-heading">
        <div class="split">
          <div class="section-header section-header-left">
            <p class="eyebrow">What it isn't</p>
            <h2 id="isnt-heading">Upstream of the application.</h2>
            <p>Other tools help you apply, and they do it well. Töökratt comes earlier. Before you enrol. Before you move. Before you apply.</p>
          </div>
          <ul class="not-list">
            <li><span class="not-mark">no</span><span>It doesn't write your CV.</span></li>
            <li><span class="not-mark">no</span><span>It doesn't apply for jobs.</span></li>
            <li><span class="not-mark">no</span><span>It doesn't keep a profile of you.</span></li>
            <li><span class="not-mark">yet</span><span>It only reads The Hub. For now.</span></li>
          </ul>
        </div>
      </section>

      <section id="next" class="band band-accent" aria-labelledby="next-heading">
        <div class="shell">
          <div class="section-header section-header-left">
            <p class="eyebrow">What's next</p>
            <h2 id="next-heading">You know what's in demand. Now where do you learn it?</h2>
            <p>That's the other half of the answer. Here's what I'm building towards.</p>
          </div>
          <div class="next-grid">
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>Skill demand, across everything</h3>
              <p>Not ten listings at a time. The whole corpus, counted.</p>
            </article>
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>Free resources per skill</h3>
              <p>Articles, courses and videos you can start today. Free. Linked, not hosted.</p>
            </article>
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>A second market: Poland</h3>
              <p>More listings. A second source. A way to compare markets side by side.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="waitlist" class="shell section" aria-labelledby="capture-heading">
        <div class="waitlist-layout">
          <div class="section-header section-header-left">
            <p class="eyebrow">Get access</p>
            <h2 id="capture-heading">Want in?</h2>
            <p>Töökratt is invite-only while it's small. Leave your email and I'll send an invite when there's room. No newsletter. No marketing platform. One email.</p>
          </div>
          <div class="forms-grid">
            <form class="form-block" id="waitlist-form" novalidate>
              <h3>Join the waitlist</h3>
              <p>Request a place. I'll write if one opens.</p>
              <div class="field">
                <label for="waitlist-name">Name <span class="optional">(optional)</span></label>
                <input id="waitlist-name" name="name" type="text" autocomplete="name" maxlength="120" />
              </div>
              <div class="field">
                <label for="waitlist-email">Email</label>
                <input id="waitlist-email" name="email" type="email" autocomplete="email" required maxlength="254" />
              </div>
              <div class="turnstile-slot" data-turnstile></div>
              <button class="btn btn-primary btn-form" type="submit">Request an invite</button>
              <p class="form-status" data-form-status data-kind="info"></p>
            </form>

            <form class="form-block" id="contact-form" novalidate>
              <h3>Write to me</h3>
              <p>A question, or something the numbers got wrong.</p>
              <div class="field">
                <label for="contact-name">Name</label>
                <input id="contact-name" name="name" type="text" autocomplete="name" required maxlength="120" />
              </div>
              <div class="field">
                <label for="contact-email">Email</label>
                <input id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" />
              </div>
              <div class="field">
                <label for="contact-message">Message</label>
                <textarea id="contact-message" name="message" required maxlength="2000"></textarea>
              </div>
              <div class="turnstile-slot" data-turnstile></div>
              <button class="btn btn-primary btn-form" type="submit">Send message</button>
              <p class="form-status" data-form-status data-kind="info"></p>
            </form>
          </div>
        </div>
      </section>
    </main>

    <footer class="shell footer">
      <span class="footer-brand">töökratt</span>
      <p class="footer-meta">© ${year} Töökratt · Built in the EU</p>
    </footer>
  </div>
`;

const waitlistForm = document.querySelector<HTMLFormElement>("#waitlist-form");
const contactForm = document.querySelector<HTMLFormElement>("#contact-form");
if (waitlistForm) {
  bindForm(waitlistForm, "waitlist");
}
if (contactForm) {
  bindForm(contactForm, "contact");
}

const market = document.querySelector<HTMLElement>("#market");
if (market) {
  mountMarket(market);
}

const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
const links = document.querySelector<HTMLElement>("#nav-links");
if (toggle && links) {
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  links.querySelectorAll("a").forEach((anchor) => {
    anchor.addEventListener("click", () => {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
  bindSectionNav(links);
}

function bindSectionNav(nav: HTMLElement): void {
  const pairs = [...nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")].flatMap((anchor) => {
    const id = anchor.getAttribute("href")?.slice(1);
    const section = id ? document.getElementById(id) : null;
    return section ? [{ anchor, section }] : [];
  });
  if (pairs.length === 0) {
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) {
        return;
      }
      for (const pair of pairs) {
        if (pair.section === visible.target) {
          pair.anchor.setAttribute("aria-current", "location");
        } else {
          pair.anchor.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
  );
  for (const pair of pairs) {
    observer.observe(pair.section);
  }
}
