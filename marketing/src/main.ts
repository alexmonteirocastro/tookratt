import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import { getAppUrl } from "./config";
import { bindForm } from "./forms";
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
          <p class="eyebrow">Job market research</p>
          <h1 id="hero-heading">What does the market actually want?</h1>
          <p class="hero-lede">
            Ask about Nordic and European startup roles. The answer comes from
            live postings on The Hub, or it doesn't come.
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
            <h3>Choosing what to study</h3>
            <p>See what the market keeps asking for before you commit to a path.</p>
          </article>
          <article class="persona">
            <h3>Just graduated</h3>
            <p>See which skills show up in real postings for the field you trained in.</p>
          </article>
          <article class="persona">
            <h3>Moving to a new country</h3>
            <p>Check whether your role is in demand where you're moving.</p>
          </article>
          <article class="persona">
            <h3>Changing direction</h3>
            <p>Set what you have next to what's in demand somewhere else.</p>
          </article>
        </div>
      </section>

      <section id="how" class="shell section" aria-labelledby="how-heading">
        <div class="split">
          <div class="section-header section-header-left">
            <p class="eyebrow">How it works</p>
            <h2 id="how-heading">Three steps. No magic.</h2>
            <p>Postings in. An answer out. Nothing in between gets invented.</p>
          </div>
          <ol class="steps">
            <li class="step">
              <span class="step-num">01</span>
              <div>
                <h3>Read the market</h3>
                <p>Open roles, remote split, and pay transparency, by country.</p>
              </div>
            </li>
            <li class="step">
              <span class="step-num">02</span>
              <div>
                <h3>Ask a real question</h3>
                <p>It searches live listings and answers from what it finds there.</p>
              </div>
            </li>
            <li class="step">
              <span class="step-num">03</span>
              <div>
                <h3>Check the source</h3>
                <p>Every claim points at a posting. If the data doesn't say it, neither do I.</p>
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
              Open roles, remote roles, and roles that publish pay.
              Denmark, Sweden, Norway, Finland, Iceland, Europe.
            </p>
          </div>
        </div>
      </section>

      <section id="isnt" class="shell section" aria-labelledby="isnt-heading">
        <div class="split">
          <div class="section-header section-header-left">
            <p class="eyebrow">What it isn't</p>
            <h2 id="isnt-heading">Upstream of the application.</h2>
            <p>The market, before anyone writes an application.</p>
          </div>
          <ul class="not-list">
            <li>It doesn't write your CV.</li>
            <li>It doesn't apply for you.</li>
            <li>It doesn't pick the perfect job for you.</li>
            <li>It doesn't invent a stat the postings don't support.</li>
          </ul>
        </div>
      </section>

      <section id="next" class="band band-accent" aria-labelledby="next-heading">
        <div class="shell">
          <div class="section-header section-header-left">
            <p class="eyebrow">What's next</p>
            <h2 id="next-heading">You know what's in demand. Now where do you learn it?</h2>
            <p>Demand first. A place to learn the skill after that. Planned, not shipped.</p>
          </div>
          <div class="next-grid">
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>Skill demand, across vacancies</h3>
              <p>Which skills keep showing up for a role, across the listings, not a handful of search hits.</p>
            </article>
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>A resource for each skill</h3>
              <p>When a skill is actually in demand, somewhere to go learn it.</p>
            </article>
            <article class="next-card">
              <p class="eyebrow">Planned</p>
              <h3>From the market back to study</h3>
              <p>What to learn next, framed by postings rather than a course list.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="waitlist" class="shell section" aria-labelledby="capture-heading">
        <div class="waitlist-layout">
          <div class="section-header section-header-left">
            <p class="eyebrow">Waitlist</p>
            <h2 id="capture-heading">Want in?</h2>
            <p>Invite only. Leave your email and I'll write when a place opens.</p>
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
