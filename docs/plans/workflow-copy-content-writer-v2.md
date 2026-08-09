# Workflow = copy of Content Writer v2

## Intent

Veto the earlier “adapt CWV2 steps onto GCC creates” plan. **Workflow should be a copy of Content Writer v2** — same panels, same Generate Content steps/tabs, same APIs — not a 5-card stub and not a remapped GCC generate UI.

## What’s wrong today

[`src/app/app/workflow/page.tsx`](../src/app/app/workflow/page.tsx) is a stub card grid. Generate only `setIsLoading(true)` with a TODO — no API call, no navigation, **no error displayed**, empty console.

## Source of truth

CWV2 project workspace (`content-writer-v2/frontend/src/app/projects/[id]/page.tsx`):

1. CrawlPanel  
2. FileUploadPanel  
3. NotesPanel  
4. **ContentResults** (steps 1–7 + Generate all + result tabs + visible error)  
5. ReviewPublishPanel  

Plus CWV2 home (`app/page.tsx`): ClientsPanel, ProjectList, ProjectForm.

GeekContentCreator already has the API client: `src/services/content-writer-api.ts` → `/api/cw` → GeekAPI CWV2 controllers. **Do not invent a parallel GCC generate path for Workflow.**

## Implementation

### 1. Copy CWV2 UI components into GeekContentCreator

Copy from `content-writer-v2/frontend/src/components/content-writer/` into `GeekContentCreator/src/components/content-writer/`:

- `ContentResults.tsx` (StepRow + tab views)
- `CrawlPanel.tsx`, `FileUploadPanel.tsx`, `NotesPanel.tsx`, `ReviewPublishPanel.tsx`
- `ProjectForm.tsx`, `ProjectList.tsx`
- Keep/align existing `ClientsPanel.tsx`

Fix imports to use:

- `@/services/content-writer-api` (not `@/lib/content-writer/api`)
- `@/lib/types` (extend with any missing CWV2 types)

Preserve CWV2 layout/classes (`border-border`, `text-brand`, etc.).

### 2. Workflow routes = CWV2 shell

- `/app/workflow`: replace stub with CWV2 **dashboard** (client select + project list + New Project). Keep WorkflowGate. Pre-select client from `readWorkflowClientHandoff()` when present.
- Add `/app/workflow/projects/[id]`: copy of CWV2 project page (Crawl → Upload → Notes → ContentResults → ReviewPublish).

Delete dead `setIsLoading` / TODO Generate handlers.

### 3. Errors must be displayed

Keep CWV2 ContentResults error line. On load/create failures, show visible errors — never silent no-ops.

### 4. Sidebar

Project links use `/app/workflow/projects/{id}`.

## Out of scope

- Remapping steps onto `generateGccCreate` / CreateDraftWorkspace  
- Changing Geek-SEO Site Analyzer  
- Editing the content-writer-v2 repo (copy only)

## Verification

- Unlock Workflow → CWV2-like dashboard (not 5 cards).  
- Open/create project → stepped Generate Content; failures show **red error** in UI.  
- Successful pillar plan appears in Technical Article tab as in CWV2.

## Todos

1. Copy CWV2 content-writer components; fix imports to content-writer-api + types  
2. Replace `/app/workflow` with CWV2 dashboard; add `/app/workflow/projects/[id]`  
3. Wire handoff client preselect; confirm Generate shows errors; remove stub cards
