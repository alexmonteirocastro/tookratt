import "@fontsource/sora/400.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";
import "@fontsource/karla/700.css";
import { getAppUrl, getContactEmail } from "./config";
import { bindForm } from "./forms";
import "./styles/main.css";

const appUrl = getAppUrl();
const contactEmail = getContactEmail();

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("#app root missing");
}

root.innerHTML = `
  <div class="page">
    <header class="shell nav">
      <a class="brand" href="#top" aria-label="Töökratt home">
        <img src="/mascot.png" alt="" width="44" height="44" />
        <span class="brand-name">töökratt</span>
      </a>
      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-links">
        Menu
      </button>
      <nav id="nav-links" class="nav-links" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#waitlist">Waitlist</a>
        <a class="btn btn-nav" href="${appUrl}">Open the app</a>
      </nav>
    </header>

    <main id="top">
      <section class="shell hero" aria-labelledby="hero-heading">
        <div class="hero-copy">
          <p class="eyebrow">Job search, reasoned</p>
          <h1 id="hero-heading">A tireless helper for those who seek work</h1>
          <p class="hero-lede">
            Ask a real question about Nordic and European startup roles.
            Töökratt retrieves live listings from The Hub and answers with
            claims grounded in real postings — or declines when it can't.
          </p>
          <div class="hero-ctas">
            <a class="btn btn-primary" href="#waitlist">Join the waitlist</a>
            <a class="btn btn-secondary" href="#how">See how it works</a>
          </div>
        </div>
        <div class="hero-visual">
          <img src="/mascot.png" alt="Töökratt mascot" width="380" height="380" />
        </div>
      </section>

      <section id="how" class="shell section" aria-labelledby="how-heading">
        <div class="section-header">
          <p class="eyebrow">How it works</p>
          <h2 id="how-heading">Ask → retrieve → answer with sources</h2>
          <p>
            A grounded RAG pipeline over The Hub — not a filter form with a chat skin,
            and not an auto-apply agent.
          </p>
        </div>
        <div class="steps">
          <div class="step">
            <span class="step-num">01</span>
            <h3>Ask what you actually want</h3>
            <p>
              Role, place, stack, or a question filters can't phrase —
              like what skills show up for founding engineers in the Nordics.
            </p>
          </div>
          <div class="step">
            <span class="step-num">02</span>
            <h3>Retrieve grounded listings</h3>
            <p>
              Semantic search over live Hub postings, with structured filters
              when country or remote preference is clear.
            </p>
          </div>
          <div class="step">
            <span class="step-num">03</span>
            <h3>Get a sourced answer</h3>
            <p>
              Every claim traces back to a real listing. If the corpus can't
              support an answer, Töökratt says so instead of inventing one.
            </p>
          </div>
        </div>
      </section>

      <section id="features" class="section section-cream" aria-labelledby="features-heading">
        <div class="shell">
          <div class="section-header">
            <p class="eyebrow">Features</p>
            <h2 id="features-heading">What it can do today</h2>
            <p>
              Honest about the current MVP: single-turn chat, no resume upload,
              no application tracking, no auto-apply.
            </p>
          </div>
          <div class="features">
            <article class="feature">
              <div class="feature-copy">
                <p class="eyebrow">Capability</p>
                <h3>Reasoning over listings, not just matching keywords</h3>
                <p>
                  Filters answer the questions the UI anticipated. Töökratt is built
                  for questions that need connecting information across postings —
                  still grounded in what is actually on The Hub.
                </p>
              </div>
              <div class="feature-panel" aria-hidden="true">
                <div class="chip-row">
                  <span class="chip">The Hub corpus</span>
                  <span class="chip">Nordics + EU startups</span>
                </div>
                <div class="chat-q">What skills show up for founding engineers in Finland?</div>
                <div class="chat-a">
                  Across the retrieved listings, teams ask for Python, cloud basics,
                  and comfort owning early product scope — each point linked to a real posting.
                </div>
              </div>
            </article>

            <article class="feature">
              <div class="feature-copy">
                <p class="eyebrow">Capability</p>
                <h3>Answers you can check</h3>
                <p>
                  Responses stay tied to retrieved jobs. Inline links point at the
                  exact Hub URLs that were passed into generation — not invented pages.
                </p>
              </div>
              <div class="feature-panel feature-panel-teal" aria-hidden="true">
                <div class="chat-q">Anything interesting for a backend engineer in Copenhagen?</div>
                <div class="chat-a">
                  Here are roles that match on location and stack, with links back to
                  each listing so you can verify the fit yourself.
                </div>
              </div>
            </article>

            <article class="feature">
              <div class="feature-copy">
                <p class="eyebrow">Capability</p>
                <h3>Limits you can see</h3>
                <p>
                  Today's chat is single-turn and anonymous. No persistent profile,
                  no CV ingestion, no corpus-wide “in-demand skills” dashboard yet —
                  those are sequenced phases, not silent claims on this page.
                </p>
              </div>
              <div class="feature-panel" aria-hidden="true">
                <p class="limit-note">
                  Built now: filtered lookup and grounded Q&amp;A over retrieved jobs.
                  Not built yet: multi-turn memory, resume upload, auto-apply, or pricing tiers.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="waitlist" class="shell section" aria-labelledby="capture-heading">
        <div class="section-header">
          <p class="eyebrow">Get involved</p>
          <h2 id="capture-heading">Waitlist and contact</h2>
          <p>
            Early access interest goes to ${contactEmail}. No spam list, no marketing platform —
            just a short note when you're ready.
          </p>
        </div>
        <div class="forms-grid">
          <form class="form-block" id="waitlist-form" novalidate>
            <h3>Join the waitlist</h3>
            <p>Be notified when we're ready for more people to try the app.</p>
            <div class="field">
              <label for="waitlist-name">Name <span style="font-weight:400;color:var(--color-text-faint)">(optional)</span></label>
              <input id="waitlist-name" name="name" type="text" autocomplete="name" maxlength="120" />
            </div>
            <div class="field">
              <label for="waitlist-email">Email</label>
              <input id="waitlist-email" name="email" type="email" autocomplete="email" required maxlength="254" />
            </div>
            <div class="turnstile-slot" data-turnstile></div>
            <button class="btn btn-primary btn-form" type="submit">Join the waitlist</button>
            <p class="form-status" data-form-status data-kind="info"></p>
          </form>

          <form class="form-block" id="contact-form" novalidate>
            <h3>Contact</h3>
            <p>Questions, feedback, or press — write a short note.</p>
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
      </section>

      <section class="cta-strip" aria-labelledby="cta-heading">
        <div class="shell">
          <img src="/mascot.png" alt="" width="130" height="130" />
          <h2 id="cta-heading">Try the live app</h2>
          <p>
            The chat UI is already up at
            <a class="mailto" href="${appUrl}">${appUrl.replace(/^https?:\/\//, "")}</a>
            — or email
            <a class="mailto" href="mailto:${contactEmail}">${contactEmail}</a>.
          </p>
          <a class="btn btn-primary" href="${appUrl}">Open Töökratt</a>
        </div>
      </section>
    </main>

    <footer class="shell footer">
      <span class="footer-brand">töökratt</span>
      <p class="footer-meta">
        © ${new Date().getFullYear()} Töökratt.
        <a href="${appUrl}">App</a>
        ·
        <a href="mailto:${contactEmail}">${contactEmail}</a>
      </p>
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
}
