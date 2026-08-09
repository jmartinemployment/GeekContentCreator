# Deploy pending fixes; give Content Writer v2's generation quality real Site Analyzer grounding

## Context

**Why GeekContentCreator exists at all:** to give content-writer-v2's generation — which, by its
own track record, writes correctly — real website context from Site Analyzer. Content-writer-v2
has no concept of a specific site's crawled pages, gap topics, or must-mention subtopics; it
generates from a generic brief. GeekContentCreator's actual job is to combine content-writer-v2's
proven generation quality with that site-specific grounding. A plan that copies content-writer-v2's
prompts without preserving that grounding produces a worse copy of content-writer-v2 and misses the
entire reason to build this instead of just using content-writer-v2 directly. **This is Phase 1's
success criterion, not a nice-to-have folded into a bigger rewrite.**

That grounding already exists and already works in GeekContentCreator's current (generic,
single-call) generation path — `GccGenerateService.cs`: `BuildAudience` (~line 933, injects gap
topic, section path, topical neighbors, and related existing pages with headings/excerpts from
Site Analyzer) and the separate `mustMentionBlock` (real subtopics from the analyzed site's
page-section trees, built by `TryBuildMustMentionSubtopicsBlock`/`GccController.cs`). **Every new
method copied from content-writer-v2 (Part B) must carry this forward into its own prompts** —
content-writer-v2's copied prompt text is the starting point for writing quality; `BuildAudience`
and `mustMentionBlock` are what make the output actually grounded in the real site, which is the
whole point. Dropping them to make the copy simpler is not an acceptable simplification.

Prior sessions also tried to patch GeekContentCreator's own Generate implementation piecemeal (fix
a routing bug here, add a length appendix there, hide unwanted types). That approach burned days
without producing a working solution. Per direction: **stop patching, replace the entire Generate
(Content Creator) section with a copy of content-writer-v2's working implementation** for the five
content types actually wanted — Pillar, Blog Post, Email, LinkedIn, Facebook — with Site Analyzer
grounding preserved in every one of them. Copy the logic (prompts, per-H2 looping, parsing,
orchestration order); do not add a dependency that calls into content-writer-v2 at runtime —
GeekContentCreator gets its own copy of this code, adapted from content-writer-v2's
`Project`/`GeneratedContentSet` persistence to GeekContentCreator's own `GccCreate`/`GccArtifact`
persistence, and adapted to inject `BuildAudience`/`mustMentionBlock` where content-writer-v2's own
version of these prompts has no equivalent at all. **Image Prompt-only is out of scope for this
phase** — not built, not included in the new UI. It's deferred, not removed.

Deploying the already-written, already-committed fixes from a prior session (Site Analyzer step
counter, heading duplication, stale gaps, Generate 400) is unrelated to this and still outstanding
— those bugs are not fixed until deployed, regardless of what happens with Generate.

## Part A — Deploy already-written fixes (unrelated to Generate, still outstanding)

1. Confirm no uncommitted/unpushed changes remain in `Geek-SEO`, `GeekBackend`, `GeekContentCreator`.
2. Trigger Railway redeploys, in order: `GeekSeoBackend`, `GeekRepository`, `GeekAPI`.
3. Apply the pending EF Core migration
   (`GeekRepository/Data/Migrations/ContentCreator/20260808120000_PurgePreFixGapsData.cs`) against
   production.
4. Confirm via Railway `get-status` that all three services' `latestDeployment` is post-fix and
   `SUCCESS`.

## Part B — Replace Generate with a copy of content-writer-v2's working implementation

**Copy source (read-only reference — copy the logic, do not call into it at runtime):**
`content-writer-v2/backend/src/ContentWriter.Application/Services/`
- `ContentGenerationOrchestrator.cs` — `GeneratePillarPlanAsync` (~line 50, H2 outline planning),
  `GeneratePillarBodyAsync` (~line 91, per-H2 body generation), `GenerateBlogAsync` (~line 255),
  `GenerateSocialAsync` (~line 430, LinkedIn/Facebook), `GenerateColdOutreachAsync` (~line 473,
  Email), `GenerateImagePromptsAsync` (~line ~500s, per-section image prompts).
- `PromptBuilders/ContentPromptBuilder.cs` — the matching prompt builders for each of the above:
  pillar/blog body prompts, `BuildSocialPrompt` (LinkedIn/Facebook cases), `BuildColdOutreachPrompt`
  (Email), `BuildSectionImagePromptsPrompt` (per-H2 image prompts) — all already read in this
  session, confirmed correct and distinctly differentiated per type/platform.
- `ContentDocumentText.cs` — `BuildSectionTargets` (builds one image-prompt target per top-level
  heading + hero).
- `ContentLengthTargets.cs` — the word-count constants these prompts reference.

**Do not delete or refactor any existing code for the deprioritized types** (TechArticle, X,
Instagram, Meta ads, Google ads, AI Tool — the `aiTool` branch, the TechArticle revise feature, the
generic `packChannels`/`GenerateRepurposePackAsync` mechanism). Leave it in place, untouched,
unused. No cleanup pass.

**Hide the Workflow page's content, not the way to reach it.** The sidebar "Workflow" link stays —
it's the only way to navigate there. What hides is what renders once you're on the page: the
`ContentBriefPanel`/brief form on `/app/workflow` and `CreateDraftWorkspace.tsx` (brief editing +
the "Content items to generate" checkbox section) — replace their content with something minimal
(e.g. "being rebuilt") rather than the current broken/piecemeal flow. **Site Analyzer stays fully
visible and untouched** — separate feature, not part of what's being replaced (see Context: Site
Analyzer grounding is the entire reason this product exists). UI-visibility change only, per
"leave existing code in place" above — don't delete `ContentBriefPanel`, `CreateDraftWorkspace`, or
any of their code, just don't render their current content. Comes back once the new copied
implementation (Part B below) is ready to replace what they currently show.

**No content-writer-v2 backend method gets called at runtime — copied, never reused.** This
includes the existing `IContentPromptBuilder _prompts` field already injected into
`GccGenerateService` (constructor-injected, currently called as `_prompts.BuildStandaloneBlogBodyPrompt(...)`
in the old `GenerateStartingContentAsync` path) — that's a live content-writer-v2 dependency
already in this codebase, predating this plan. The new methods below must not call `_prompts` at
all. They build their own prompt text as new C# string-building code in `GccGenerateService.cs`,
using content-writer-v2's actual prompt text (read from the files above) as the copied starting
point, not by invoking any `IContentPromptBuilder` method — new or old. The old `_prompts` call
in `GenerateStartingContentAsync` stays (per "leave existing code in place" above) but becomes
unused once the new UI stops routing through it.

**Every new method must inject Site Analyzer grounding — this is not optional.** Each new method
below takes `SiteSectionContextDto? section` and the create's must-mention block as real
parameters (same as the existing `GenerateStartingContentAsync`/`BuildAudience` call already does)
and includes that context in its own prompt text — related pages (title/URL/headings/excerpt), gap
topic, topical neighbors, and must-mention subtopics. Content-writer-v2's own version of these
prompts has no such parameter at all (it has no Site Analyzer concept); when copying its prompt
text as the writing-quality starting point, add the grounding block content-writer-v2 doesn't have
— don't copy it as-is and lose what GeekContentCreator exists to add. For the per-H2 Pillar/Blog
body generation specifically, this means each individual H2's prompt should include the related
pages/must-mention data relevant to grounding that section, not just the top-level outline call.

**Add, as new code in GeekContentCreator's own files (does not touch/replace the old paths above):**
- `GeekBackend/GeekAPI/Services/ContentCreator/GccGenerateService.cs` — new methods, copied from
  the orchestrator methods above and adapted to load/persist against `GccCreate`/`GccArtifact`
  instead of `Project`/`GeneratedContentSet`, and adapted to include Site Analyzer grounding (see
  above, since content-writer-v2's originals have none): Pillar and Blog each get outline planning
  → per-H2 body generation → per-H2 image prompts (+ hero). Email/LinkedIn/Facebook each get their
  own differentiated prompt (copied from `BuildSocialPrompt`/`BuildColdOutreachPrompt`) plus one
  image prompt each.
- `GeekBackend/GeekAPI/Controllers/ContentCreator/GccController.cs` — new Generate wiring for
  these five types, calling the new methods above in content-writer-v2's `GenerateAllAsync` order
  (plan → body → per-H2 image prompts, then social, then email). The existing
  `RunGenerateAsync`/`RunMultiGenerateAsync` machinery stays in place, untouched, for whatever
  still references it — the new wiring is separate, new code.
- New frontend UI in `CreateDraftWorkspace.tsx` (or a new component) that calls the new backend
  wiring for Pillar, Blog Post, Email, LinkedIn, Facebook — replacing the hidden checkbox section
  from above. Exact shape (separate buttons per type vs. a new smaller multi-select) isn't decided
  yet — flag for a quick check before building it, don't assume the old checkbox-and-one-button
  pattern is still right just because it's familiar.
- `GeekContentCreator/src/lib/content-creator/brief-catalog.ts` (`CONTENT_LENGTH_TARGETS`) — add
  entries for the five kept types under names matching the new UI exactly (`email`,
  `linkedIn`, `facebook`); leave existing entries for other types in place, unused.

## Verification

- `dotnet build` clean in `GeekBackend`; `npx tsc --noEmit` clean in `GeekContentCreator`.
- The old "Content items to generate" checkbox section no longer renders anywhere in the UI.
- New UI for exactly Pillar, Blog Post, Email, LinkedIn, Facebook is in place and calls the new
  backend wiring — TechArticle/X/Instagram/Meta ads/Google ads/AI Tool have no UI entry point at
  all (their backend code is untouched and intentionally still present, per Part B — not a target
  for this verification pass). Image Prompt-only is also absent from this UI — deferred, not part
  of this phase.
- Generate a Pillar: body is generated per-H2 (not one single call), one image prompt per H2 plus
  a hero image prompt, matching content-writer-v2's own pillar output structure.
- Generate a Blog Post: same per-H2 treatment (this is the one deliberate change from
  content-writer-v2, which only gave Blog one image prompt total — Blog now gets one per H2 too).
- Generate Email, LinkedIn, Facebook individually: each reads with real platform-specific
  structure (not the old generic undifferentiated copy), each with its own single image prompt.
- **The actual point of this product:** generate a Pillar or Blog on a create with a real Site
  Analyzer `siteSection` attached (real related pages, real gap topic) — confirm the generated
  body references/aligns with those related pages and doesn't duplicate their content, and that
  must-mention subtopics from the analyzed site actually show up. Then generate the same create's
  type with `siteSection` stripped/null and confirm the output is visibly more generic — if there's
  no visible difference, the grounding didn't make it into the new methods and this plan has failed
  its actual goal regardless of how correct the copied prose quality is.
- Railway: all three services deployed post-fix and `SUCCESS`; migration applied; Workflow →
  Content Brief → Generate no longer 400s.
