# Geek Content Creator — Plan (ready for automated review)

| | |
|--|--|
| **Status** | Ready for automated review (pass 2) |
| **Review focus** | Consistency of locks; scope boundaries; LLM budgets; naming |
| **New repo** | `/Users/jeffmartin/development/GeekContentCreator` (Next.js scaffolded) |
| **Copies (same content)** | This file · `GeekContentWorkflow/CONTENT_CREATOR_PLAN.md` · `/Users/jeffmartin/development/CONTENT_CREATOR_PLAN.md` |
| **Last locked** | 2026-08-01 |

---

## 1. One-sentence product

**Content Creator** is a new app that does Content Writer v2’s *job* (write the outputs you choose, including standalone image prompts) with a usable interface, **Site Analyzer** (content gaps **and** existing site content into create), revise, on-page SEO, polish, content approval, and post-approval repurpose — not Content Writer v2’s old screens and not Geek Content Workflow.

---

## 2. Naming rules (reviewers)

| Prefer (spell out) | Avoid |
|--------------------|--------|
| **Geek Content Creator** (product) / repo `GeekContentCreator` | Folder name `ContentCreator` |
| Content Creator | OK short name in UI copy when clear |
| Content Writer v2 | CWV2, CW2, CW |
| Geek Content Workflow | GCW |
| Site Analyzer (UI) | Niche (UI); Niche OK only as legacy code name |
| **Starting content** / **What to write** | Calling create-time selection “Mix” |
| **Repurpose** / **Repurpose chooser** | “Mix” without defining it |
| **Revise** | “Revise chat” (implies a message thread) |
| **Research dossier** (later only) | Shipping “Research Packet” in first release |
| **Content approval** vs **application approval** | Using “approval” ambiguously |
| — | Content Writer v3 / v4 |

**“Mix”** = post-**content**-approval **Repurpose chooser** only (types + counts).

**Content approval** = operator approves a draft artifact.  
**Application approval** = product go-ahead for this app; gates later phases (research dossier, etc.).

---

## 3. Tech stack and infrastructure (assumed)

Same platform family as Geek Content Workflow — not a new auth/API island.

| Layer | Assumption |
|-------|------------|
| App | Next.js app at `GeekContentCreator` |
| Auth | GeekOAuth |
| API / persistence | GeekAPI + GeekRepository; Content Creator owns its document/version/approval domain |
| Writing | Shared Content Writer v2 **generate engine** (orchestrator, prompt builders, image-prompt builders) as **in-process library and/or GeekAPI internal services** |
| Hosting | Confirm at scaffold (expect same Geek / Railway-class pattern as sibling apps) |

**Infrastructure today:** GeekOAuth, GeekAPI, Content Writer v2 on GeekAPI, and Geek Content Workflow facades are live and usable as references. Content Creator itself is **not** wired yet — stack is the intended default; smoke verification happens at scaffold.

**Open at scaffold only:** extract shared writing package vs call existing GeekAPI in-process services first (**contract stays the same** — engine API, not Content Writer v2 project-field HTTP).

---

## 4. Decisions locked

1. **New project** at `GeekContentCreator` — not inside Geek Content Workflow.  
2. **Framing:** same *job* as Content Writer v2; **new UI** — do not copy Content Writer v2’s interface.  
3. **Not** a remote client that only fills Content Writer v2 project API fields (`targetKeyword`, `notes`, uploads, `generate/pillar`).  
4. **Writing integration:** Content Creator owns documents/versions/approvals; shared generate engine as above.  
5. **Not** Content Writer v3 / v4.  
6. **Create:** human picks **starting content**. Pillar is **optional**.  
7. **Repurpose (Mix):** after **content approval** only. Human chooses types + counts; no auto full suite.  
8. **Revise:** feedback **textarea**; human chooses **Full** or **Section**; all content types; **new version** each time. Not a multi-turn chat thread.  
9. **SEO (first release):** on-page / structural only (draft + target keyword) — Geek Content Workflow analyzer class. Panel beside draft, on demand — not keystroke-realtime, not SERP coverage. Does **not** require a research dossier.  
10. **Site Analyzer — day one:** capability inside Content Creator (not the product name). **Understand the site** → topical map → **identify content gaps** → human picks a gap → **start a create**. Additionally, **existing site content** from that analysis (pages, headings, summaries, related pillars already on the site) **feeds into Generate** as creation context so new drafts align with what the site already says — not gap topic alone. Reuse Niche analyzer / Geek-SEO site model + gap signals; new usable UI.  
    **Fixes a Content Writer v2 gap:** entering a keyword from “home” / project setup did **not** pull reference content from the site **section** where that keyword or content gap lives. Content Creator **must not** repeat that — Generate for a Site Analyzer–started create is grounded in the **relevant site section** (related pages, headings, excerpts), not keyword-alone.  
11. **Research dossier (“Research Packet”)** — **descoped** to later phase **after application approval**. Includes formal packet, AI deep research, manual SERP/competitor uploads, research-backed coverage scoring. Site Analyzer site context in day one is **not** that dossier; it is the analyzed site model / excerpts available from Site Analyzer.  
12. **Calendar** later (after content-approval path works).  
13. **LLM budgets** derived from what the human selected (see §7).  
14. **Image prompts — day one:** standalone (human context required when not via Mix) and attached/Mix (artifact is context). Prompt **text** only; not pixel render.  
15. **AI Tools — day one:** context required, **source flexible** — artifact-derived names (pick which) **or** human-supplied name list + short brief. Not required: approved Pillar/TechArticle with a Tools section.  
16. **Repo path:** `/Users/jeffmartin/development/GeekContentCreator` (Next.js scaffolded; open this folder to continue).

### Writing integration — are / are not

| Are | Are not |
|-----|---------|
| New app + own persistence | Filling Content Writer v2 project fields as the product design |
| Shared Content Writer v2 generate engine | Deep-link into Content Writer v2’s old screens |
| Engine in GeekAPI or shared package | Treating Content Writer v2 HTTP project API as the product contract |
| Site Analyzer Generate with **site section context** | Keyword-from-home Generate with **zero** site section reference (Content Writer v2 failure) |

---

## 5. In scope (first release)

### Create → write → ship
- **Starting content** chooser (pillar optional; **Image prompt** is a valid starting type)  
- Topic / keyword (+ optional freeform notes — not a formal research dossier)  
- **Site Analyzer (day one):** site understanding → **content gaps** → start create from a chosen gap; **existing site content feeds Generate** as context  
- Generate starting content  
- **Image prompts** (standalone or attached)  
- **Revise** (textarea + Full/Section) per artifact, all types  
- **On-page SEO** + Polish + **Content approval**  

### After content approval — Repurpose chooser (“Mix”)

Human picks types + counts, then Generate:

| Type | Count control | Notes |
|------|---------------|--------|
| Blog post | on/off | If not already produced |
| TechArticle | on/off | |
| Email / cold email | count | |
| LinkedIn | count | |
| X / Twitter | count | |
| Instagram | count | |
| Meta ads | count | |
| Google ads | count | |
| AI Tools | count or name list | **Context required, not a fixed source.** From an artifact’s named tools when present (pick which), **or** human supplies tool names + short brief. Generate blocked if no names/context. Not required: approved Pillar/TechArticle with a Tools section. |
| Image prompts | on/off (or per selected artifact) | Context = approved artifact(s); no extra freeform required |

---

## 6. Feature locks (detail)

### Revise

| Rule | Detail |
|------|--------|
| UI | Feedback **textarea** (Geek Content Workflow revise pattern, purpose = revise) |
| Scope | Human chooses **Full** or **Section** every time |
| Applies to | All content types (including image-prompt artifacts) |
| Persistence | Always a **new version** |
| SEO / Polish apply-fixes | Via revise → new version |

### Image prompts (day one)

Content Writer v2 only generates image prompts after pillar + blog as a project step. Content Creator must support **just create an image prompt**.

| Path | Context | Mechanism |
|------|---------|-----------|
| **Standalone** (starting content; **not** via Mix) | **Required:** topic/title + description/notes. Generate blocked without context. | **1 LLM call** → structured prompt text (JSON). Not pixels. |
| **Attached / Mix** | Artifact body/sections are context; freeform optional | **1 LLM call** per artifact (or one section-batch for that artifact) |

Attached prompts available for **all content types**. Pixel render (image-generator) is **not** day one.

### AI Tools (day one)

Same spirit as image prompts: **context required, source flexible.**

| Path | Context |
|------|---------|
| **From an artifact** | Names available on a Pillar, TechArticle, or notes — human picks which tools to generate |
| **Human-supplied** | Tool names + short brief (what each is / angle). No approved long-form required |

Generate blocked only when there are **no tool names / no usable context**. Do **not** require “approved Pillar or TechArticle with a Tools section.” UI may use toggles when names already exist, or a name list + notes field otherwise. LLM: **~2** calls per selected tool (body + metadata).

#### Implementation contract (scaffold / generate API)

When building Content Creator, AI Tool generate **must** accept either input shape (same endpoint or one request DTO):

```text
ToolGenerateRequest:
  toolNames: string[]          # required, non-empty after trim
  brief: string | null         # human short brief / angle (required if no sourceArtifactId)
  sourceArtifactId: id | null  # optional — when set, names may be prefilled/filtered from artifact
  selectedNames: string[] | null  # optional subset when picking from artifact-derived list
```

- Reject generate if `toolNames` (or resolved selected names) is empty.  
- Do **not** gate on “content-approved Pillar/TechArticle with Tools section.”  
- Prefer extracting candidate names from `sourceArtifactId` when present; always allow override / full human list.  
- Persist one tool-page artifact per selected name; budget **~2** LLM calls each (body + metadata).

### Site Analyzer (day one) — gaps + existing site content into create

**Job:** (1) Find where the site is **missing** content so the operator can start writing there. (2) Use **what the site already has** as input when generating new content. Capability of Content Creator — not a separate product.

| Step | What happens |
|------|----------------|
| 1. Connect / analyze site | Crawl or load site model (Niche analyzer / Geek-SEO backed) |
| 2. Topical map | Topics and headings the site covers (or should cover) |
| 3. **Identify gaps** | Topics/headings with **no page**; `suggest_pillar_page`-class; orphan pillars |
| 4. Human picks a gap | Operator chooses one gap from the list |
| 5. Start create | Prefill topic / keyword / starting-content from that gap |
| 6. **Feed existing site content into Generate** | Pass site context into the writing engine: related existing pages (titles, headings, short excerpts/summaries), topical neighbors, voice/structure cues from the site model — so the draft fits the site, avoids duplicating pages, and can cross-link sensibly |

**Site context (day one) vs research dossier (later):** Site context = output of Site Analyzer’s understanding of **this** site. Research dossier = optional later AI deep research + manual SERP/competitor uploads. Day one Generate from a Site Analyzer create **must** include site context when a site analysis is attached; it must **not** require a research dossier.

**Problem this fixes (Content Writer v2):** Keyword entered from home / project setup often generated with **no reference** to existing pages or the **site section** where that keyword or content gap belongs. Content Creator Generate **must** attach that site section context (related pages, headings, excerpts) so drafts are site-grounded — **not** keyword-alone from “home.”

**Not:** Ahrefs competitor keyword-gap warehouse. **Not:** product named Site Analyzer. **Not:** keyword-alone Generate when Site Analyzer context is available.

**Day one acceptance:** (a) see content gaps, pick one, create prefilled; (b) Generate receives **existing site content from the relevant site section** (visible/inspectable — e.g. “using N related pages from this site section”); (c) smoke proves Generate is **not** keyword-only when site analysis is attached.

#### Implementation contract (scaffold / Generate API)

When building Content Creator, Generate for a Site Analyzer–started create **must** accept site section context (same generate request or attached create record):

```text
SiteSectionContext:
  siteAnalysisId: id
  gapTopic: string                 # chosen gap / keyword
  gapSectionPath: string | null    # topical path / department / section on the site
  relatedPages: [                  # required non-empty when siteAnalysisId set
    { url, title, headings[], excerpt }  # excerpt = short text from existing page
  ]
  topicalNeighbors: string[]       # related topic names from the map

GenerateRequest (Site Analyzer path):
  ...standard fields (starting content type, topic, notes)...
  siteSection: SiteSectionContext | null
```

- If create was started from Site Analyzer (`siteAnalysisId` present), **reject Generate** when `relatedPages` is empty / missing — do not allow keyword-only.  
- Prompt builders **must** include `relatedPages` + `gapSectionPath` + neighbors in the engine input (titles, headings, excerpts) — not only `gapTopic`.  
- UI shows that site context is attached (count of related pages / section path).  
- Creates **without** Site Analyzer may still Generate from topic/notes alone (pillar-optional path); this gate applies only when Site Analyzer context is claimed.

### SEO (day one)

Self-contained on-page checks: draft document + target keyword (lede/heading presence, density band, length, section count). No SERP, no research dossier dependency.

---

## 7. LLM call budget

| Selected | LLM calls |
|----------|-----------|
| Any social/ads with counts | **1** pack (chosen channels only — not one call per post) |
| Blog / TechArticle | **1** each |
| Email | **1 × count** |
| Each AI Tool | **~2** (body + metadata) |
| Each Revise | **1** |
| Image prompts (standalone) | **1** (human context required) |
| Image prompts (attached / Mix) | **1** per artifact (or one section-batch) |
| Starting long-form (pillar / blog / TechArticle) | Engine-defined (sectioned as required); not a fixed single call |

**Not allowed:** auto full repurpose suite on content approval; one LLM call per social post inside a pack; forcing pillar on every create; requiring research dossier for v1 generate or on-page SEO; **Site Analyzer–started Generate with keyword only and no site section context** (Content Writer v2 failure mode).

---

## 8. Explicitly later (after **application** approval)

- Research dossier (Research Packet)  
- AI deep research agent (search + fetch + cite)  
- Manual SERP / competitor / People Also Ask upload pipeline  
- Research-backed (Surfer-class) coverage SEO  
- Calendar  
- Pixel render of image prompts via image-generator  

---

## 9. Out of scope (first release)

- Content Writer v2’s old interface  
- Shipping inside Geek Content Workflow  
- Content Writer v3 / v4  
- Product branded Niche or Site Analyzer  
- Research Packet / research dossier  
- AI deep research pipeline  
- Formal manual research upload pipeline  
- Research-backed / Surfer-class SEO  
- Ahrefs-scale keyword warehouse  
- Scraping Google SERP HTML  
- Calendar  
- Multi-turn revise chat thread  
- Pixel render of image prompts  

---

## 10. Create loop

```mermaid
flowchart TD
  app[Geek_Content_Creator]
  analyzer[Site_Analyzer_gaps]
  start[Starting_content_chooser]
  generate[Generate]
  revise[Revise_Full_or_Section]
  seo[On_page_SEO]
  polish[Polish]
  approval[Content_Approval]
  repurpose[Repurpose_chooser_Mix]
  laterResearch[Research_dossier_after_app_approval]
  calendar[Calendar_later]

  app --> analyzer
  app --> start
  analyzer -->|"list_content_gaps"| pickGap[Human_picks_gap]
  pickGap -->|"prefill_topic"| start
  analyzer -->|"existing_site_content"| siteCtx[Site_context_into_Generate]
  start --> generate
  siteCtx --> generate
  generate --> revise
  generate --> seo
  generate --> polish
  revise --> approval
  seo --> approval
  polish --> approval
  approval --> repurpose
  approval -.-> calendar
  approval -.-> laterResearch
```

---

## 11. Existing systems (reuse vs ignore)

| System | Role |
|--------|------|
| Content Writer v2 | Job framing; shared generate / image-prompt **engine** — **not** UI to clone |
| Niche analyzer / Geek-SEO | **Site Analyzer** capability: site model, topical map, **content gaps**, and **existing page/content context for Generate** — not Niche UI |
| Geek Content Workflow | Feature inventory (revise textarea, on-page SEO, polish, approval, packs) to **re-home** — not the product shell |
| GeekOAuth + GeekAPI | Auth and API infrastructure (assumed) |
| Content Writer v3 / v4 | Ignore |
| image-generator | Later: pixel render only |

---

## 12. Build sequence

1. Scaffold done at `/Users/jeffmartin/development/GeekContentCreator`. Next: GeekOAuth + GeekAPI + starting-content chooser.  
2. Generate + Revise (Full/Section) + on-page SEO + Polish + Content approval.  
3. Standalone image prompt (human context required) + attached/Mix image prompts for all types.  
4. **Site Analyzer day one:** analyze site → list **content gaps** → pick gap → prefilled create; **existing site content attached as Generate context**.  
5. Repurpose chooser after content approval (types + counts + image prompts + AI Tools with flexible context).  
6. Smoke: Blog-only (no pillar); **Site Analyzer gap → create with site context in Generate**; standalone image prompt; AI Tools from human names; Mix image prompts; Revise; approve → Repurpose.  
7. **After application approval:** Research dossier + AI deep research + manual uploads + coverage SEO.  
8. Calendar / pixel render via image-generator.

---

## 13. Acceptance criteria (review / smoke)

- [x] Create Blog (or Email/Social) without a pillar.  
- [x] Pillar available when wanted.  
- [x] **Site Analyzer:** show **content gaps** for a site (topics/headings with no page / suggest-pillar-class gaps). *(Geek-SEO-backed; fail closed if site not analyzed)*  
- [x] **Site Analyzer:** pick a gap → create opens with topic/keyword prefilled.  
- [x] **Site Analyzer:** Generate includes **existing site content from the relevant site section** (not keyword/gap title alone). *(real related pages from site model; reject if empty)*  
- [x] **Regression vs Content Writer v2:** Site Analyzer–started Generate is **not** “home keyword with zero site section context.”  
- [x] Standalone image prompt create with required human context (blocked without context).  
- [x] Mix / attached image prompts use approved artifact as context.  
- [x] Image prompts for all content types when attached; prompt text only.  
- [x] Revise: Full or Section; new version; all types including image prompts.  
- [x] On-page SEO works from draft + keyword (no research dossier).  
- [x] Content approval required before Repurpose; Repurpose human-chosen; no auto suite. *(approval state from GeekAPI only)*  
- [x] **AI Tools:** generate with human-supplied name list + brief (no Pillar/TechArticle required).  
- [x] **AI Tools:** generate by picking names from an artifact when present.  
- [x] **AI Tools:** blocked only when no names/context — not blocked for missing Tools section.  
- [ ] LLM usage matches §7 (pack = one call for social/ads; ~2 per AI Tool; 1 per revise / image-prompt path). *(wired; confirm with live token counts)*  
- [x] No Research Packet / AI deep research required for first-release happy path.  
- [x] No Content Writer v2 old project UI on happy path.  
- [x] Stack assumption: GeekOAuth + GeekAPI (confirm at scaffold).  
- [x] Repo is `/Users/jeffmartin/development/GeekContentCreator` (Next.js scaffolded).  

---

## 14. Open items (allowed after this review)

- Extract shared writing package vs GeekAPI in-process services first (same engine contract).  
- Auth/hosting details confirmed at scaffold.  
- Optional Repurpose presets (pre-fill only; still require Generate).  
- Search provider — only when Research dossier phase starts (after application approval).

---

## 15. Success

Someone uses **Content Creator** to find a **site content gap** (Site Analyzer), start create with that topic, and **Generate using existing site content as context**, or pick other **starting content** (pillar optional, or standalone image prompt with context), then revise / on-page SEO / polish / content-approve / repurpose — on GeekOAuth/GeekAPI, without a research dossier, without Content Writer v2’s painful screens.
