# Expand LedeType to 12-type taxonomy with audience + angle — proper plan

> **Scope note (2026-08-11):** User removed the `65f36a5` regression fix from this plan ("would break app"). That track is dropped entirely — no `ContentGenerationOrchestrator.cs:1037` change in this plan. Track F (LedeType expansion) is the sole scope, now extended to wire **audience** and **angle** from `brief-catalog.ts` into the LLM lede selection.

## Goal

Expand `LedeType` from a 2-value binary (`Creative`/`Summary`) to the full 12-type taxonomy, and make the LLM's lede-type choice be guided by the operator's **audience** and **angle** brief controls (currently hidden UX elements that exist in the Content Brief but never reach the lede prompt).

## Success Criteria

- `LedeType` enum (`GeekAPI/Services/Workflow/Domain/Entities/ContentDocument.cs:5`) exposes 12 values matching the saved taxonomy; existing persisted `"Creative"` / `"Summary"` values still deserialize (parser-tolerant).
- Prompt contracts (`ContentPromptBuilder.cs:213-214` `LedeJsonContract` / `LedeAndIntroductionJsonContract`) accept all 12 values; the binary `creative|summary` framing is gone from prompt text (`BuildArticleLedePrompt:355`, `BuildArticleLedeAndIntroductionPrompt:405`).
- `LlmResponseJsonParser.cs:125-196` (`ParseLede`, `ParseLedeAndIntroduction`, `LedeResponse`) parses all 12 string values case-insensitively; legacy payloads with `"creative"` / `"summary"` still succeed.
- Lede generation prompts include **audience + angle context** so the model can pick the best-fit lede type for that brief — not just a free choice among 12. Audience/angle are sourced from the persisted `ContentBrief` (see Hidden UX section) and surfaced in the prompt.
- Persistence remains safe: `LedeType` is string-serialized via `JsonStringEnumConverter` (`GeekAPI/Program.cs:39`, `ClientSnapshotSerializer.cs:17`, `ProjectSnapshotSerializer.cs:19`) — no migration needed.
- `dotnet build GeekAPI/GeekAPI.csproj` succeeds. Frontend `npm run build` succeeds (no frontend `LedeType` mirror currently exists — confirmed zero hits for `ledeType|LedeType` in `GeekContentCreator/src` — so no TypeScript change required unless a display is added).
- Manual generation probe: several pillar bodies across different `audienceSegment` × `angle` combinations produce varied, contextually appropriate `ledeType` values from the 12 (not stuck on one).

## Context

**Taxonomy.** `LedeType` is currently 2 values (`ContentDocument.cs:5-9`):

```csharp
public enum LedeType { Creative, Summary }
```

Durable taxonomy lives in `lede_types_taxonomy.md` (12 types, 2 categories):

- **Direct News (4):** Summary, Immediate-Identification, Delayed-Identification, Single-Item
- **Creative and Feature (8):** Anecdotal, Narrative, Scene-Setting, Startling-Statement, Direct-Address, Question, Quote, Wordplay

User reversed the prior deferral — expand now.

**Prior scope mapping.** Earlier draft flagged three traces still outstanding:

1. Every `LedeType`/`ledeType` reference in GeekBackend (confirmed this pass):
   - `ContentDocument.cs:5` — enum definition.
   - `ContentPromptBuilder.cs:213-214` — `LedeJsonContract` is `"creative"|"summary"`; `BuildArticleLedePrompt:355` / `BuildArticleLedeAndIntroductionPrompt:405` both say "Prefer a creative...; use a summary only if...".
   - `LlmResponseJsonParser.cs:125-196` — `ParseLede`/`ParseLedeAndIntroduction` do binary `string.Equals(...,"summary") ? Summary : Creative`; `LedeResponse` holds `string? LedeType`.
   - `GeneratedContent.cs:27` holds `LedeType?`; `ToolPageGenerator.cs:238,297` hardcodes `LedeType.Summary` for tool pages (left as-is — see Out of Scope).
2. Prompt instruction framing — the binary choice must be rewritten to offer the full 12 with guidance.
3. Frontend mirror — `grep -rn ledeType|LedeType` in `GeekContentCreator/src` returns **zero** hits — no TypeScript mirror to update.

**Hidden UX elements that should influence lede selection.** Found in `src/lib/content-creator/brief-catalog.ts` — operator-facing controls that already exist in the Content Brief but are not currently threaded into the lede-selection prompt. The user asked to include these as LLM inputs when picking a lede type:

### Hidden UX: Audience (brief-catalog.ts:51-69, stored in ContentBrief:200-202)

```ts
export const AUDIENCE_SEGMENTS = [
  { value: "affinity", label: "Affinity Segments" },
  { value: "in_market", label: "In-Market Segments" },
  { value: "life_events", label: "Life Events" },
  { value: "detailed_demographics", label: "Detailed Demographics" },
  { value: "your_data", label: "Your Data Segments (formerly Remarketing)" },
  { value: "custom", label: "Custom Segments" },
] as const;

export const AUDIENCE_DETAILS = [
  { value: "demographic_attributes", label: "Demographic Attributes" },
  { value: "behavioral_triggers", label: "Behavioral Data Triggers" },
  { value: "boolean_combination", label: "Boolean Combination Logic" },
] as const;
// ContentBrief fields:
 // audienceSegment: AudienceSegment | ""
 // audienceDetails: AudienceDetail[]
 // audienceNotes: string  (free text — "If notes conflict with segment, follow notes." at :454)
```

Google Ads grounded segments (cite: `https://support.google.com/google-ads/answer/2497941`). UI lives in `ContentBriefPanel.tsx:382` (segment) + chips for details. Persisted as part of `ContentBrief` JSON and transported as `GccCreateDto.BriefJson` to the backend (`GccGenerateService.cs:200` `BuildBriefAndResearchBlock` dumps the raw `BriefJson` into the prompt's `=== BRIEF ===` block, but the lede-specific prompt builder `ContentPromptBuilder` never extracts audience/angle to guide the `ledeType` choice).

### Hidden UX: Angle (brief-catalog.ts:76-83, stored in ContentBrief:203)

```ts
export const CONTENT_ANGLES = [
  { value: "comparative", label: 'The Comparative Angle ("Versus")' },
  { value: "problem_solution", label: "The Problem-Solution Angle" },
  { value: "case_study_data", label: "The Case Study / Data-Driven Angle" },
  { value: "ultimate_guide", label: 'The Comprehensive "Ultimate Guide" Angle' },
] as const;
// ContentBrief field: angle: ContentAngle | ""
```

Internal editorial control (not a Google attribute — see file header at :5-7). UI at `ContentBriefPanel.tsx:436`. Gated with `TONE_COMPATIBILITY` and `toneAllowed()` at :133-174.

**Backend plumbing gap.** `ProjectGenerationContext` (`GeekAPI/Services/Workflow/DTOs/GenerationRequest.cs:8`) currently carries `TargetKeyword`, `Department`, `SiteName`, etc., but **no** `AudienceSegment`/`AudienceNotes`/`ContentAngle` fields — so even though `GccGenerateService.BuildBriefAndResearchBlock` includes the raw `BriefJson` string in the research block, the lede prompt builders (`ContentPromptBuilder.cs:344-464`) have no typed audience/angle to tailor the lede-type instruction. This plan closes that gap.

## Constraints & Assumptions

- `src/lib/` vs `src/services/` rule (`AGENTS.md`): no fetch/API code in `src/lib/`. This plan touches `GeekBackend` C# and prompt text; frontend needs no new fetch client — just the existing `BriefJson` already sent.
- No content-writer reuse (`GeekBackend/AGENTS.md`, `feedback_no_content_writer_reuse.md`): GeekAPI owns its generation code.
- Plans are durable (`feedback_plan_location.md`): this file lives in `docs/plans/` in-repo.
- No migration for `LedeType`: confirmed string serialization via `JsonStringEnumConverter` at `Program.cs:39` and snapshot serializers — expanding the enum is additive.
- Regression fix explicitly excluded per user direction — `ContentGenerationOrchestrator.cs:1037` (`introductionHeading` predicate) is **not** touched by this plan.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Regression fix | Dropped entirely | User stated it would break the app; removed from scope |
| LedeType values | 12 enum members matching taxonomy verbatim | Replaces the binary; `Creative`/`Summary` names partially retained (see below) |
| LedeType C# naming | PascalCase members (`Summary`, `ImmediateIdentification`, `DelayedIdentification`, `SingleItem`, `Anecdotal`, `Narrative`, `SceneSetting`, `StartlingStatement`, `DirectAddress`, `Question`, `Quote`, `Wordplay`) | Follows existing convention; JSON wire uses camelCase via `JsonStringEnumConverter` |
| Legacy `Creative` wire value | Parser tolerant of legacy `"creative"` (map to `Anecdotal` or keep `Creative` as `[Obsolete]` 13th member) | Keeps old persisted articles readable; decision to confirm during implementation — recommend tolerant fallback to `Anecdotal` if `Creative` is removed, or keep `Creative` `[Obsolete]` for zero-risk back-compat |
| LLM choice framing | Replace binary "prefer creative" with full 12-type list + one-line guidance per type **plus** audience/angle guidance | Model picks best fit for brief context rather than free choice |
| Audience/angle wiring | Extract `audienceSegment` + `audienceDetails` + `audienceNotes` + `angle` from `GccCreateDto.BriefJson` into `ProjectGenerationContext` fields, surface in `BuildArticleLedePrompt` + `BuildArticleLedeAndIntroductionPrompt` | These hidden brief controls already exist and are validated (`GccGenerateService.cs:155-198` `ValidateBriefRequired`); they just never reach the lede prompt as typed context |
| Tool pages | Leave `ToolPageGenerator.cs:238,297` pinned to `Summary` | Tool ledes are not pillar ledes; out of scope for this plan |
| Frontend | No new TypeScript `LedeType` mirror required (zero current hits) | Unless operator-facing lede-type display is added later |

## Recommended Approach

### F1 — Enum expansion

`GeekAPI/Services/Workflow/Domain/Entities/ContentDocument.cs:5-9`:

```csharp
public enum LedeType
{
    Summary,
    ImmediateIdentification,
    DelayedIdentification,
    SingleItem,
    Anecdotal,
    Narrative,
    SceneSetting,
    StartlingStatement,
    DirectAddress,
    Question,
    Quote,
    Wordplay
}
```

Alternative if strict back-compat preferred: keep `Creative` as a 13th member `[Obsolete("Use specific creative types")]` — still accept `"creative"` on the wire. Flag choice in commit message.

### F2 — Typed audience/angle on ProjectGenerationContext

`GeekAPI/Services/Workflow/DTOs/GenerationRequest.cs:8`:

- Add to `ProjectGenerationContext`:
  ```csharp
  string? AudienceSegment = null,
  IReadOnlyList<string>? AudienceDetails = null,
  string? AudienceNotes = null,
  string? ContentAngle = null
  ```
  (or a small `BriefContext` record grouping them — keep flat if that matches existing context style).
- Populate at the single construction site(s) where `BriefJson` is available: `GccGenerateService.cs` (`BuildMinimalContext` / `GeneratePillarBodyAsync` path and the `Workflow` orchestrator's `ProjectGenerationContext` builder). Parse `BriefJson` via `JsonDocument` (already done in `ValidateBriefRequired:160` and `BuildConsultantAppendix:272`) to extract `audienceSegment`, `audienceDetails`, `audienceNotes`, `angle`. Normalize with existing `LEGACY_*` maps if needed (see `brief-catalog.ts:260-300` for legacy value migration).
- No change to `ProjectGenerationContext` callers that don't have a brief (e.g. minimal contexts for tool tests) — new fields default to `null`/empty.

### F3 — Prompt contracts and lede instruction

`ContentPromptBuilder.cs:213-219`:

- Update `LedeJsonContract` from `"creative"|"summary"` to the 12-value union (wire values are camelCase per `JsonStringEnumConverter`, e.g. `"summary"`, `"immediateIdentification"`, `"delayedIdentification"`, `"singleItem"`, `"anecdotal"`, `"narrative"`, `"sceneSetting"`, `"startlingStatement"`, `"directAddress"`, `"question"`, `"quote"`, `"wordplay"`).
- Update `LedeAndIntroductionJsonContract` similarly (it embeds `LedeJsonContract`).

`ContentPromptBuilder.cs:344-383` (`BuildArticleLedePrompt`) and `385-464` (`BuildArticleLedeAndIntroductionPrompt`):

- Remove the binary framing at `:355` / `:405`:
  `"Prefer a creative (hook/narrative) opening; use a summary... only if..."`
- Replace with a block that:
  1. Lists all 12 lede types with a one-line when-to-use cue (reuse examples from `lede_types_taxonomy.md`).
  2. Injects the brief's audience/angle context so the model can tailor the choice, e.g.:
     ```
     Audience: {audienceSegment} — details: {audienceDetails} — notes: {audienceNotes}
     Angle: {angle}
     Lede guidance by angle:
       comparative  → prefers Question, StartlingStatement, SingleItem (stakes/contrast)
       problem_solution → prefers Anecdotal, SceneSetting, DirectAddress, Question (pain-first)
       case_study_data → prefers ImmediateIdentification, SingleItem, Quote, StartlingStatement (evidence-first)
       ultimate_guide → prefers Summary, DelayedIdentification, DirectAddress (comprehensive framing)
     Lede guidance by audience:
       affinity/in_market → more narrative/anecdotal room
       detailed_demographics/your_data → more direct-address/question
       (If audienceNotes conflict with segment, follow notes — same rule as brief-catalog.ts:454.)
     Pick ONE ledeType from the 12 that best fits this audience + angle + heading/topic.
     ```
     Exact wording to be tuned during implementation, but the mapping must be present — not a free 12-way choice without brief guidance.
  3. Keep existing hard rules: heading is a real headline (never literal `"Creative Lead"`), `PAIN BEFORE SOLUTION`, 2–3 paragraphs, `imagePrompt`.

### F4 — Parser

`LlmResponseJsonParser.cs:125-196`:

- Update `LedeResponse` handling to parse any of the 12 wire values case-insensitively into `LedeType`.
- Update both `ParseLede` and `ParseLedeAndIntroduction` — currently share the binary `string.Equals(...,"summary") ? Summary : Creative` branch at `:136-138` / `:172-174`.
- Handle legacy wire values:
  - `"summary"` → `Summary` (unchanged).
  - `"creative"` → either `Creative` (if kept as 13th member) or fallback to `Anecdotal` (closest generic creative) with no throw, so old payloads remain readable. Document choice in code comment.
  - Unknown value → throw `ContentGenerationException` with the raw value surfaced (don't silently coerce).

### F5 — Build & persist

- No persistence change: `GeneratedContent.cs:27` `LedeType?` + `JsonStringEnumConverter` already string-serializes. Document confirmation in commit message.
- `ToolPageGenerator.cs:238,297` stays pinned to `Summary` — no change.

### F6 — Frontend (if needed)

- No `LedeType` mirror currently exists in `GeekContentCreator/src` (confirmed zero hits). If an operator-facing lede-type badge is later desired, add a TypeScript union `type LedeType = "summary" | "immediateIdentification" | ...` — not required for this plan.

## Work Plan

| Step | Owner | Files | Validation |
|---|---|---|---|
| F0 | Trace | `ContentDocument.cs`, `ContentPromptBuilder.cs`, `LlmResponseJsonParser.cs`, `GeneratedContent.cs`, `Program.cs`, snapshot serializers, `ToolPageGenerator.cs`, `GenerationRequest.cs`, `GccGenerateService.cs`, `GeekContentCreator/src/**` | Confirm no missed `ledeType` site; confirm string persistence; confirm frontend has no mirror; confirm audience/angle extraction points |
| F1 | Backend | `GeekAPI/Services/Workflow/Domain/Entities/ContentDocument.cs` | Enum has 12 members; `dotnet build` green |
| F2 | Backend | `GeekAPI/Services/Workflow/DTOs/GenerationRequest.cs`, `GeekAPI/Services/ContentCreator/GccGenerateService.cs` (and Workflow context builder if separate) | `ProjectGenerationContext` carries audience/angle; populated from `BriefJson`; defaults safe for callers without brief |
| F3 | Backend | `GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs` | Prompt text lists 12 types + audience/angle guidance; `LedeJsonContract` / `LedeAndIntroductionJsonContract` reflect 12; binary framing removed |
| F4 | Backend | `GeekAPI/Services/Workflow/Services/LlmResponseJsonParser.cs` | `ParseLede` + `ParseLedeAndIntroduction` accept all 12; legacy `"creative"`/`"summary"` still parse (tolerant) |
| F5 | Build | — | `dotnet build GeekAPI/GeekAPI.csproj` green |
| V1 | Manual | — | Generate pillars across varied `audienceSegment` (affinity, in_market, your_data) × `angle` (comparative, problem_solution, case_study_data, ultimate_guide) → LLM picks varied `ledeType` values, visibly shaped by brief (e.g. `problem_solution` + `affinity` leans Anecdotal/SceneSetting; `comparative` leans Question/StartlingStatement) |
| V2 | Persisted-data | — | Load existing articles with `ledeType: "Creative"` / `"Summary"` → deserializes cleanly after expansion |
| V3 | Frontend (optional) | — | `npm run build` only if frontend touched; currently no mirror so no build needed |

## Validation

- **Builds:** `dotnet build GeekAPI/GeekAPI.csproj` (required). `npm run build` in `GeekContentCreator` only if frontend touched.
- **Diff review:** `LedeType` diff shows 12 members; prompt diff shows removed binary framing and added 12-type + audience/angle block; parser diff shows 12-way parse + legacy handling.
- **Generation probes:** pillars across audience × angle matrix to confirm `ledeType` diversity and brief-sensitivity (see V1 above).
- **Back-compat:** deserialize fixture JSON with `ledeType: "Creative"` and `ledeType: "Summary"` after expansion — must not throw.
- **Pre-existing failures:** if any failure reproduces on `main` without these changes, treat as unrelated.

## Risks & Mitigations

- **Risk:** Removing `Creative` breaks deserialization of legacy payloads still carrying `"creative"`. Mitigation: either keep `Creative` as `[Obsolete]` 13th member or make parser map `"creative"` → `Anecdotal`; document choice in commit and code comment.
- **Risk:** 12-way choice with audience/angle guidance causes model to over-fit one type (e.g. always `Summary`). Mitigation: per-angle/per-audience cues in prompt (see F3) give the model a reason to vary; verify with V1 diversity probe and tune wording if stuck.
- **Risk:** `AudienceSegment`/`Angle` string values drift between frontend `brief-catalog.ts` and backend `BriefJson` (legacy values like `interest_affinity`, `case_study` still in migrated data). Mitigation: reuse the same normalization as `ValidateBriefRequired` / `BuildConsultantAppendix` and `brief-catalog.ts:260-300` legacy maps when extracting; test with a legacy `BriefJson` fixture.
- **Risk:** Adding fields to `ProjectGenerationContext` breaks minimal contexts used in tests/tool generation. Mitigation: new fields default to `null`/empty; existing construction sites compile without new args.

## Out of Scope / Follow-ups

- `65f36a5` regression fix (`ContentGenerationOrchestrator.cs:1037` `IsIntroductionSection` predicate) — explicitly excluded per user direction ("would break app").
- "Child headings (injected)" / `HierarchyContextPanel.tsx` — separate Site Analyzer feature, not this orchestrator code.
- "Top AI Tools for {topic}" Tools H2 naming not honored — recorded as follow-up.
- Pillar outline flat-H2 vs H3 subheadings — recorded as follow-up.
- V2/V3/V4 naming cleanup and LM Studio removal remain in `docs/plans/rename-content-writer-legacy-naming.md`.
- `ToolPageGenerator.cs` hardcoded `Summary` for tool pages — left pinned; tool ledes are not pillar ledes.
- Frontend `LedeType` display badge — follow-up if desired.

## Open Question for Approval

- **`Creative` legacy member:** remove and rely on parser tolerance (`"creative"` → `Anecdotal`) or keep as 13th `[Obsolete]` member for absolute back-compat? Recommendation: remove and rely on parser tolerance (taxonomy stays pure 12), but keeping it is zero-cost if you prefer.

---
*Revised 2026-08-11 per user direction: removed regression fix, added audience (6 segments + 3 details + notes at `brief-catalog.ts:51-69`) and angle (4 values at :76-83) wiring so LLM lede selection is guided by brief context. Taxonomy source: `lede_types_taxonomy.md` (12 types: 4 Direct News + 8 Creative/Feature). Hidden UX sources: `AUDIENCE_SEGMENTS`, `AUDIENCE_DETAILS`, `CONTENT_ANGLES`, `ContentBrief` interface in `brief-catalog.ts`; backend brief transport is `GccCreateDto.BriefJson` via `GccGenerateService.cs:200` `BuildBriefAndResearchBlock`; context record is `ProjectGenerationContext` (`GenerationRequest.cs:8`).*
