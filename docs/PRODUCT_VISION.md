# Product Vision

*Status: Accepted. Companion to `docs/adr/`. See [ADR-0001](adr/0001-llm-provider-strategy.md) and [ADR-0002](adr/0002-retrieval-filtering-strategy.md) for the technical decisions this vision motivates.*

*Revision history: 2026-09-23. Refocused from job-search/CV assistant to market research + learning resources. The earlier direction (candidate profile, cover-letter drafting, CV ingestion) stays in git history and is not a roadmap item.*

## 1. Problem

People deciding what to learn, where to move, or whether to change direction are guessing. Job boards, The Hub included, are filtering interfaces: country, role, remote or on-site, seniority. Filters only answer the questions the form already thought of. The useful part of a listing, the skills a role actually asks for, what is required versus nice-to-have, what the team does, sits in free text no filter can total up.

The result is a market that is hard to read. A skill can be common across hundreds of listings and still invisible, because no one screen shows the corpus. A person can pick a course, a country, or a new role without knowing whether listings keep asking for it.

Töökratt is a research tool for that question. It reads job listings, says what the market is asking for, and points at free material for learning it. It does not help someone apply. The Hub is the source today. It is not assumed to be the only one.

## 2. Who this is for

Someone making a bet about their own skills, not someone running a search to submit an application:

* A student choosing what to study.
* A new graduate checking which skills show up in real postings for the field they trained in.
* Someone moving to another country, checking whether their role is in demand there.
* Someone changing direction, setting what they have next to what listings keep asking for.

This is the person reading the market, not the startup or recruiter posting on it. Recruiter-facing tools are a different product.

## 3. Differentiation thesis

**Reasoning over the corpus, not just matching against it.**

The smaller version of this product is "the same filters, but as a chat window": "show me frontend jobs in Sweden." That is a nicer way to search. It is not the point. The point is questions a filter cannot be phrased to answer, because the answer connects listings to each other, or connects what is in demand to somewhere to learn it:

* "What skills are most in demand for a founding engineer in the Nordics?"
* "Where is backend hiring actually concentrated right now, and how does Finland compare with Sweden?"
* "If I want to move into design, which skills do Swedish startup listings keep asking for?"
* "Which of those skills have a free course I can start from?"

None of these map onto a filter. They are answerable, in principle, by an LLM that retrieves listings and reasons over what it retrieves, and, for the last question, by a catalog of learning resources the backend can link to. That is the bet.

## 4. Capability tiers

These questions are not one feature. They do not all need the same architecture. Treating them as one undifferentiated "reasoning RAG" feature is how a roadmap gets vague. Each tier gets its own architecture decision when it is scheduled.

Tier 3 is the centre of the product. Tiers 1 and 2 are how a person inspects the listings behind a claim. Tiers 4 and 5 are what you can do once the demand signal exists: point at something to learn, and compare more than one market. There is no tier for matching a person to a job, and no tier for writing an application.

| Tier | Example | What it needs | Status |
| -- | -- | -- | -- |
| **1. Filtered lookup** | "Frontend jobs in Sweden" | Top-k dense retrieval + structured payload filter | Built ([ADR-0002](adr/0002-retrieval-filtering-strategy.md)) |
| **2. Single-listing grounded Q&A** | "What does this team do?" | Top-k retrieval, answer grounded in one or a few docs, decline if unsupported | Built ([ADR-0001](adr/0001-llm-provider-strategy.md)) |
| **3. Corpus-level aggregation** | "What skills are most in demand for a founding engineer in the Nordics?" | Reasoning across many or most listings, not a top-5 window. Likely a pre-aggregated layer (skill or keyword frequency computed at ingestion) that the LLM reasons over, rather than raw retrieval over `document_text` | **The centre of the product. Not built. Discovery is [ALE-190](https://linear.app/alex-projects/issue/ALE-190/spike-evaluate-corpus-level-skill-aggregation-approach-tier-3-in).** |
| **4. Learning resources for in-demand skills** | "Where can I learn the skills those listings keep asking for?" | A catalog of free learning material, matched to skills tier 3 actually found. Links are built by the backend and attributed to the provider | Not built. Discovery is [ALE-199](https://linear.app/alex-projects/issue/ALE-199/spike-discover-freecodecamp-catalog-access-video-coverage-and-skill). |
| **5. Cross-market comparison** | "How does demand for backend roles in Finland compare with another market?" | More than one job source, ingested into a shape the same questions can run on | Not built. The Hub is the only source today. Discovery of a second source (justjoin.it) is [ALE-198](https://linear.app/alex-projects/issue/ALE-198/spike-discover-justjoinit-data-access-tos-corpus-size-and-schema). |

Tier 3 is not "tier 1 with a bigger `limit`." Five nearest-neighbor jobs cannot say what is most in demand across the Nordics. The honest answer needs a wider retrieval window with real aggregation, or a separate structure built during ingestion. That decision gets its own ADR. It is not bolted onto the single-document RAG path.

For role-shaped phrases like "founding engineer," titles and descriptions usually say the thing outright, so keyword and title matching is the likely extraction path. "In-demand skills" is the harder problem: a corpus-level overview no top-k window can honestly give. How to derive it is ALE-190.

## 5. Phased roadmap

The core path is market data in, demand signals out, then somewhere to learn the skill. No phase ingests a CV or keeps a candidate profile.

**Phase 1. Demand signals (current focus).** Tiers 1 and 2 already ship. Tier 3 is the new capability: what listings ask for, where, and for which roles, from the corpus we have. The Hub is the source in this phase, not a promise that it stays the only one.

Shipped already: a per-country market overview (open roles, remote roles, roles that publish pay, and jobs per role), on the app and on the homepage (ALE-191, ALE-192, ALE-193).

Still open in this phase: better filters from free text, for role, company, and title. That is a tier-1 improvement (ALE-188).

Accounts exist for access control only: invite-only, email and password, an admin who can invite and revoke (ALE-189). No profile, no stored career data, no personalization.

**Phase 2. How to learn it.** Once a skill is actually in demand, point at a free resource for it (ALE-199). The link is chosen by the backend from a catalog, and the answer names the provider. This phase does not teach the skill, and it does not rewrite the material.

**Phase 3. More than one market.** A second job source (ALE-198), so the same demand questions can be compared across markets (tier 5). The second corpus has to stay in sync with ingestion the same way the first one does.

## 6. Non-goals

Out of this vision, not deferred:

* CV or resume ingestion, storage, or tailoring
* Cover letters, applications, or any drafting on the person's behalf
* Per-user profiles, and personalization that scores a skill gap against a person's background
* Full-text tutoring from learning content. A link and an attribution, not a course delivered inside the chat

Out of scope for the current stage, so they are not quietly in the next phase either:

* Persistent or cross-session conversation history (current memory is in-tab and bounded; see [ADR-0008](adr/0008-multi-turn-conversation-memory.md))
* Notifications, alerts, or any proactive or async behaviour
* Recruiter or startup-facing features of any kind
* Multi-language generation (the corpus already includes non-English listings, see ADR-0002's accepted risks)

## 7. Trust bar: what makes an answer good enough to act on

The anti-hallucination stance ([ADR-0001](adr/0001-llm-provider-strategy.md) Decision 3: decline rather than fabricate) extends to every tier:

* A tier-1 or tier-2 answer must never state a match that is not grounded in a retrieved listing.
* A tier-3 answer must say how many listings it is actually drawing from. It must not imply corpus-wide authority from a small sample.
* A tier-4 link is built by the backend from the catalog, never written by the LLM. Same principle as [ADR-0009](adr/0009-grounded-inline-job-hyperlinks.md): the model does not invent URLs. The answer always names the provider.
* A tier-5 comparison must not pretend a market is covered when that source was never ingested.

It is fine for the system to say it does not have enough information. It is never fine for it to sound confident while being wrong.

## 8. Scaling posture

The project is built to survive going from a personal learning project to something with real users. The same framing already justified paying small costs early ([ADR-0002](adr/0002-retrieval-filtering-strategy.md)'s payload indexing, [ADR-0005](adr/0005-visual-design-tokens-for-the-chat-ui.md)'s token system).

* Real users means real Gemini API costs and rate limits at volume (ADR-0001's risk section, partly addressed by ALE-87).
* Tier 3, once built, is a second structure that has to stay in sync with ingestion, not just the vector index.
* A second job source, and a learning-resource catalog, are further corpora with the same obligation. Multi-source ingestion is a scaling problem, not a one-off import.
* This vision does not add a store of personal career data. Accounts, when they come, hold login state only (ALE-189). Conversation memory stays the bounded, in-tab store from ADR-0008.

## Open questions

* **In-demand skills (tier 3, ALE-190).** Pre-aggregated skill frequencies at ingestion, wider retrieval plus summarization, or something else. Unsettled until that spike reports. The ADR comes after the spike, not before.
* **Learning catalog (tier 4, ALE-199).** Whether a free catalog can be matched to the skills tier 3 emits, tightly enough to link without the model improvising a URL.
* **Second job source (tier 5, ALE-198).** Whether another board can be ingested under its terms, at a useful size, into a schema the same demand questions can run on.
