# Integrate Content Brief into Workflow Generate Pipeline

## Context

Workflow project generation currently falls back to a generic warning message ("Generated from the keyword ... alone") because the Content Brief data never reaches the generation orchestrator. Recent frontend commits added UI validation requiring a complete Brief before allowing Generate, but the Brief's data isn't actually wired into the pipeline — it's cosmetic gating only.

**Two independent backend entities need linking:**
- Workflow `Project` (the thing Generate operates on via `projectId`)
- GCC `GccCreate` (the separate record storing `briefJson`)

Today a fragile client-side localStorage cache keyed by raw keyword text is the only "link" — it breaks if the keyword is edited and isn't visible to the backend.

**Decision:** Persist a durable, typed link between `Project` and its Brief, mirroring the existing pattern used for Hierarchy and SERP context fields (which are cached onto `Project` rather than fetched live at generation time).

## Goal

Make the 13 Brief-shaped fields (`AudienceSegment`, `ContentAngle`, `ToneOfVoice`, etc.) that `ProjectGenerationContext` and `ContentPromptBuilder` already know how to consume actually get populated from the saved Brief, so:
1. Generated content reflects the brief's audience/angle/tone/CTA/intent.
2. The fallback "keyword alone" message disappears when a Brief is present.
3. The Brief persists durably on the Project and survives keyword edits.

## Implementation Plan

### Backend (GeekAPI) — sequenced

Backend-first so frontend can call the new endpoint. All changes in `/Users/jeffmartin/development/GeekBackend/GeekAPI` (and/or the `/Volumes/Seagate/GeekBackend/GeekAPI` mirror).

**Step 1: Add fields to Project entity**

File: `Services/Workflow/Domain/Entities/Project.cs`

Add two fields next to the existing Hierarchy/SERP fields:

```csharp
/// <summary>Durable link to the Content Creator GccCreate holding the operator-authored Brief.</summary>
public Guid? LinkedCreateId { get; set; }

/// <summary>Cached copy of the linked create's BriefJson, refreshed each time the brief is saved from the UI — avoids a live cross-service fetch during Generate.</summary>
public string? BriefJson { get; set; }
```

**Step 2: Update snapshot serialization**

File: `Services/Workflow/Infrastructure/Serialization/ProjectSnapshotSerializer.cs`

- Add `LinkedCreateId` and `BriefJson` fields to the `ProjectSnapshot` record (line 94-121).
- Thread them through `Serialize()` (line 22) and `Deserialize()` (line 57).
- Bump `SchemaVersion` from `2` to `3` (line 26) — optional but consistent with intent. The deserializer already handles missing fields as null/defaults, so no migration logic is needed.

**Step 3: Add request/response DTOs**

File: `Controllers/Workflow/Contracts/ProjectContracts.cs`

Add a request DTO (mirroring the existing `UpdateSerpContextRequest` at line 21-25):

```csharp
public record UpdateProjectBriefRequest(Guid CreateId, string? BriefJson);
```

Add `Guid? LinkedCreateId` to `ProjectDetailResponse` (line 32-46) so the frontend can read the link on page load.

**Step 4: Add controller endpoint**

File: `Controllers/Workflow/ProjectsController.cs`

Add a new endpoint mirroring `UpdateSerpContext` (line 156-185):

```csharp
[HttpPut("{id:guid}/brief")]
public async Task<ActionResult<ProjectDetailResponse>> UpdateBrief(
    Guid id, [FromBody] UpdateProjectBriefRequest request, CancellationToken cancellationToken)
{
    var project = await _projectStore.GetAsync(id, cancellationToken);
    if (project is null) return NotFound();
    if (request.CreateId == Guid.Empty) return BadRequest("CreateId is required.");

    project.LinkedCreateId = request.CreateId;
    project.BriefJson = string.IsNullOrWhiteSpace(request.BriefJson) ? null : request.BriefJson;
    project.UpdatedAtUtc = DateTime.UtcNow;
    await _projectStore.SaveAsync(project, cancellationToken);
    return Ok(ToDetail(project));
}
```

Also add `project.LinkedCreateId` to the `ToDetail()` method's response mapping (lines 187-223) so it's included in the response.

**Step 5: Wire Brief data into generation context**

File: `Services/Workflow/Services/ContentGenerationOrchestrator.cs`

In `BuildContext()` (line 815-913):

- Add `using GeekAPI.Services.ContentCreator;` to the top of the file.
- Right before the `return new ProjectGenerationContext(...)` call, populate the Brief fields:

```csharp
var brief = GccGenerateService.ExtractBriefFields(project.BriefJson);
```

Then fill in the 13 trailing parameters (currently `null`) in the `ProjectGenerationContext` constructor with values from the extracted Brief:

```csharp
return new ProjectGenerationContext(
    // ... existing parameters ...
    // trailing 13 Brief-shaped parameters (currently omitted, defaulting to null):
    AudienceSegment: brief.Segment,
    AudienceDetails: brief.Details,
    AudienceNotes: brief.Notes,
    ContentAngle: brief.Angle,
    PrimaryIntent: brief.PrimaryIntent,
    SecondaryIntent: brief.SecondaryIntent,
    BuyingStage: brief.BuyingStage,
    ToneOfVoice: brief.ToneOfVoice,
    EeatSignals: brief.EeatSignals,
    CtaType: brief.CtaType,
    CtaLabel: brief.CtaLabel,
    LengthBand: brief.LengthBand,
    WritingNotes: brief.WritingNotes
);
```

**Step 6: Fix fallback-message logic**

File: `Services/Workflow/Services/ContentGenerationOrchestrator.cs`

Update `HasNoResearchInput()` and `BuildNoResearchWarning()` (lines 982-991) to account for Brief presence:

```csharp
private static bool HasNoResearchInput(ProjectGenerationContext context) =>
    context.CrawledHeadings.Count == 0
    && context.CrawledParagraphs.Count == 0
    && context.KeywordSources.Count == 0
    && context.MatchedUseCase is null
    && string.IsNullOrWhiteSpace(context.AudienceSegment)
    && string.IsNullOrWhiteSpace(context.ContentAngle)
    && string.IsNullOrWhiteSpace(context.PrimaryIntent)
    && string.IsNullOrWhiteSpace(context.WritingNotes);

private static string BuildNoResearchWarning(string targetKeyword) =>
    $"Generated from the keyword \"{targetKeyword}\" alone — no crawled site content, uploaded keyword sources, matched Home-page Use Case, or Content Brief were available.";
```

**Step 7: Update reference documentation**

File: `docs/patches/GenerationRequest.cs.new` (in this repo, GeekContentCreator)

The reference copy is stale (only lists `ContentAngle`). Replace its contents with the real, current `GenerationRequest.cs` from GeekAPI (which already has all 13 Brief fields). This ensures future cross-repo coordination stays accurate.

Optionally, add new patch files documenting the `ContentGenerationOrchestrator.BuildContext` Brief-population block and the new `ProjectsController.UpdateBrief` endpoint, e.g.:
- `docs/patches/ContentGenerationOrchestrator.BuildContext.cs.patch`
- `docs/patches/ProjectsController.UpdateBrief.cs.patch`

---

### Frontend (GeekContentCreator) — depends on backend steps 1-4

Only proceed after the GeekAPI changes above land and the service is redeployed.

**Step 8: Add field to ProjectDetail type**

File: `src/lib/types.ts`

Add to the `ProjectDetail` interface (around line 281-297):

```ts
linkedCreateId?: string | null;
```

**Step 9: Add service function for linking Project to Brief**

File: `src/services/content-writer-api.ts`

Add a new function (mirroring `updateProjectHierarchyContext`, line 141-163):

```ts
export function updateProjectBrief(
  projectId: string,
  input: { createId: string; briefJson: string | null },
): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}/brief`, {
    method: "PUT",
    body: JSON.stringify({ createId: input.createId, briefJson: input.briefJson }),
  });
}
```

**Step 10: Wire Brief-save to Project link**

File: `src/components/content-creator/ContentBriefPanel.tsx`

Add an optional `projectId` prop to the component props (this is additive; other callers in `CreateDraftWorkspace.tsx` etc. won't pass it and are unaffected).

In `handleSaveBrief()` (line 255-280), right after the existing `patchBriefResearch(id, { briefJson: briefToJson(brief) })` call succeeds, add:

```ts
if (projectId) {
  await updateProjectBrief(projectId, { createId: id, briefJson: briefToJson(brief) });
}
```

Import `updateProjectBrief` from `@/services/content-writer-api`.

This keeps the Project↔Create link-write colocated with the existing Brief save, rather than widening the `onBriefSaved` callback signature.

**Step 11: Pass createId and projectId to ContentBriefPanel on Workflow page**

File: `src/app/app/workflow/projects/[id]/page.tsx`

Update the `<ContentBriefPanel>` props (currently lines 134-143):

```tsx
<ContentBriefPanel
  clientId={project.clientId}
  siteAnalysisId={siteAnalysisId ?? undefined}
  targetKeyword={project.targetKeyword}
  createId={project.linkedCreateId ?? undefined}
  projectId={project.id}
  onBriefSaved={(_id, complete) => {
    setBriefSaved(complete);
    setBriefComplete(complete);
  }}
  onBriefValidityChange={setBriefComplete}
/>
```

This closes the loop: on first Brief save, `ensureCreateId()` creates a fresh `GccCreate` (unchanged behavior). Immediately after, the new `updateProjectBrief` call persists `LinkedCreateId` and `BriefJson` onto the `Project`. On subsequent page loads, `project.linkedCreateId` flows in as the `createId` prop, so `ContentBriefPanel` reuses the same create instead of the keyword-keyed localStorage lookup.

**Step 12: No changes to generate functions**

The `generatePillarPlanContent(projectId)`, `generateBlogContent(projectId)`, etc. functions in `content-writer-api.ts` and their callers in `ContentResults.tsx` need no changes. The Brief flows in transparently via GeekAPI's own `BuildContext(project)` using the cached `project.BriefJson` — no new request-body field is needed on generate calls.

---

## Sequencing

1. **Deploy GeekAPI** with steps 1-7 (entity, serialization, contracts, controller, orchestrator wiring, fallback-message fix, docs).
2. **Then deploy GeekContentCreator** with steps 8-11 (frontend types, service function, component updates, page updates).
3. If these land separately in the same PR, put all GeekAPI changes in one commit/batch and all GeekContentCreator changes in a separate commit/batch, so the sequence is clear from git history.

---

## Verification

### Smoke test (backend-only, before frontend lands)

1. Via Postman or curl, `PUT /api/projects/{projectId}/brief` with:
   ```json
   {
     "createId": "<a-known-gcc-create-id>",
     "briefJson": "{...JSON with audienceSegment, contentAngle, toneOfVoice, primaryIntent, writingNotes...}"
   }
   ```
   Confirm the response includes the `linkedCreateId` in the `ProjectDetailResponse`.

2. `POST /api/projects/{projectId}/generate/pillar-plan` (or whichever pillar/blog generate route is quickest).

3. Inspect the outbound LLM prompt logs/request for the `"Audience:"`, `"Angle:"`, `"Tone of voice:"`, `"CTA:"`, `"Primary intent:"`, `"Writing notes:"` blocks that `ContentPromptBuilder.cs` (lines 237-264) is already wired to emit — confirms `BuildContext()` → `ExtractBriefFields()` → prompt wiring end-to-end.

### No-research-warning regression test

1. Create a new Project with minimal inputs (no crawl, no keyword uploads, no matched use case).
2. Leave Brief empty or unlinked.
3. Generate a pillar/blog and confirm `articleRow.NoResearchWarning` is populated with the fallback message.
4. Save a Brief to the same Project (step 11 lands, Brief is wired).
5. Generate again and confirm the warning is **gone** (or reflects only the now-empty crawled/keyword-sources/use-case gaps if Brief alone is present).

### Full frontend flow

1. On a Workflow project page, fill in the Content Brief (audience, angle, tone, etc.) and click Save.
2. Confirm the Brief panel shows a success indicator (this already works via `onBriefSaved`).
3. Reload the page (browser refresh, not just React state).
4. Confirm the Brief re-hydrates — fields are populated and visually indistinguishable from before the reload.
5. Confirm the link came from `project.linkedCreateId` (not the localStorage keyword-keyed fallback) by clearing localStorage and reloading again — the Brief should still load.
6. Click Generate (any content type) and inspect the resulting pillar/blog content for audience/angle/tone/CTA alignment with the saved Brief (e.g., does the tone match the saved tone-of-voice selection?).

### Keyword-edit regression check

1. Save a Brief to a Project with keyword "AI Content Strategy".
2. On the project edit page, change the keyword to "AI Content Workflows" and save.
3. Return to the project detail page and confirm the Brief is **not** lost or reset — the `LinkedCreateId` is independent of the keyword field, so this should be transparent.
4. Re-generate and confirm the Brief still influences the output.

---

## Critical Implementation Files

**GeekAPI (backend):**
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Services/Workflow/Domain/Entities/Project.cs` (add LinkedCreateId, BriefJson fields)
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Services/Workflow/Infrastructure/Serialization/ProjectSnapshotSerializer.cs` (thread through Serialize/Deserialize)
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Controllers/Workflow/Contracts/ProjectContracts.cs` (add UpdateProjectBriefRequest DTO, update ProjectDetailResponse)
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Controllers/Workflow/ProjectsController.cs` (add UpdateBrief endpoint and ToDetail mapping)
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Services/Workflow/Services/ContentGenerationOrchestrator.cs` (populate Brief fields in BuildContext, fix fallback-message logic)
- `/Users/jeffmartin/development/GeekBackend/GeekAPI/Services/ContentCreator/GccGenerateService.cs` (reused, not modified — `ExtractBriefFields`)

**GeekContentCreator (frontend):**
- `/Users/jeffmartin/development/GeekContentCreator/src/lib/types.ts` (add linkedCreateId to ProjectDetail)
- `/Users/jeffmartin/development/GeekContentCreator/src/services/content-writer-api.ts` (add updateProjectBrief function)
- `/Users/jeffmartin/development/GeekContentCreator/src/components/content-creator/ContentBriefPanel.tsx` (add projectId prop, wire updateProjectBrief in handleSaveBrief)
- `/Users/jeffmartin/development/GeekContentCreator/src/app/app/workflow/projects/[id]/page.tsx` (pass createId and projectId into ContentBriefPanel)

**Documentation (reference copies in GeekContentCreator):**
- `/Users/jeffmartin/development/GeekContentCreator/docs/patches/GenerationRequest.cs.new` (replace with current real file, no longer stale)
- Optionally add `/Users/jeffmartin/development/GeekContentCreator/docs/patches/ContentGenerationOrchestrator.BuildContext.cs.patch` and `/docs/patches/ProjectsController.UpdateBrief.cs.patch` documenting the new wiring.

---

## Notes

- `Project` storage in GeekAPI is in-memory JSON (via `ProjectSnapshotSerializer`), not SQL — "schema change" means adding entity fields and threading through serialization, no migrations needed.
- `ProjectGenerationContext` already has all 13 Brief-shaped fields; they just aren't being populated today. This is data-plumbing, not new prompt logic.
- `ContentPromptBuilder.cs` already knows how to consume these fields (lines 237-264) and emits "Audience:", "Angle:", etc. prompt lines — that logic is unchanged.
- The link direction (Project → GccCreate via LinkedCreateId + cached BriefJson on Project) mirrors the existing pattern for Hierarchy/SERP fields, avoiding a live cross-service HTTP fetch during generation.
- The localStorage keyword-keyed cache in `ContentBriefPanel.tsx` remains as a same-session fallback for brand-new creates without a Project yet, but is no longer the source of truth once a Project exists.
