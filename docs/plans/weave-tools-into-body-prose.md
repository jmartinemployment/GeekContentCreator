# Weave Hierarchy Tools Into Body Prose — Plan

**Goal:** When tools are extracted from a crawled hierarchy node, weave mentions of each tool naturally into the generated pillar/blog body prose with contextual links to tool pages, rather than in a dedicated "Tools" section.

**Status:** Planned

## Problem

Current behavior:
- Tools extracted from "Top … Tools: tool1, tool2" paragraphs are stored in `Project.HierarchyToolNames`
- Generation includes these tools only if they happen to be mentioned by the LLM
- No dedicated link generation or contextual prose about each tool

Desired behavior:
- Tools listed in h4 → h5 → ul → li → p → a structure are extracted
- LLM weaves tool mentions naturally into relevant body sections
- Each mention links to the tool's generated tool page
- Tools are introduced contextually, not in a dump list

Example structure to extract:
```
<h4>AI Content Creation Workflow</h4>
<h5>Automated Content Generation</h5>
<p>Description…</p>
<h5>Top AI Content Creation Tools</h5>
<ul>
  <li><p><a href="...">Jasper</a></p></li>
  <li><p><a href="...">Copy.ai</a></p></li>
  <li><p><a href="...">ChatGPT</a></p></li>
  <li><p><a href="...">Claude</a></p></li>
</ul>
```

## Solution Outline

### 1. Extract Tools from h5 UL Structure

**Backend (GeekAPI):**
- File: `GeekAPI/Services/Workflow/Services/SiteCrawlerService.cs` or the page-section parsing logic
- Update the crawl parsing to detect `h5 + ul > li > p > a` patterns
- Extract both tool names AND their context (the h5 heading text, e.g., "Top AI Content Creation Tools")
- Store in `Project.HierarchyToolNames` (reuse existing field)

**Frontend (GeekContentCreator):**
- File: `src/lib/content-creator/hierarchy-match.ts` → `parseHierarchyToolNames()`
- Update regex or add logic to detect ul > li > a patterns in paragraph text
- Or: pass structured HTML instead of text (requires crawl schema change — likely not feasible mid-cycle)

### 2. Pass Tools + Context to Generation Prompt

**Backend (GeekAPI):**
- File: `GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs`
- In `BuildArticleBodyPrompt()` or `BuildArticleLedePrompt()`:
  - Add a new section of prompt guidance: `=== TOOLS TO CONTEXTUALLY MENTION ===`
  - Format: for each tool, include the tool name + brief guidance on where/when to mention it
  - Example:
    ```
    === TOOLS TO CONTEXTUALLY MENTION ===
    You have access to these tools; weave natural mentions into relevant sections with links:
    - Jasper: AI writing assistant; mention when discussing draft automation
    - Copy.ai: Content generation platform; mention in automation workflow context
    - ChatGPT: LLM for brainstorming; mention in ideation sections
    - Claude: Advanced reasoning AI; mention in complex task contexts
    ```

### 3. Generate Tool Posts

**Status:** Already shipped — `generateToolsFromNames` exists and generates tool posts.

Ensure the tool pages are generated BEFORE the pillar/blog so that tool URLs are deterministic and can be linked.

### 4. Link Tool Mentions in Output

**Backend (GeekAPI):**
- File: `GeekAPI/Services/Workflow/Services/Export/SectionHtmlRenderer.cs` or post-generation link rewriting
- After the LLM generates body HTML, scan for tool name mentions
- Replace bare mention with `<a href="/department/tool-{toolSlug}">{toolName}</a>`
- Match tool names carefully (case-insensitive, word-boundary aware to avoid false positives)

Alternative: Have the LLM output Markdown with links `[ToolName](#)` and rewrite URLs during HTML conversion.

### 5. Update Prompt Metadata

**File:** `GeekAPI/Services/Workflow/DTOs/GenerationRequest.cs` / `ProjectGenerationContext`
- Add optional `ToolNamesWithContext: IDictionary<string, string>` to pass tool name → context mapping
- Or extend existing `HierarchyToolNames` with descriptions (requires schema change)

## Files to Modify

**Backend:**
- `GeekAPI/Services/Workflow/Services/SiteCrawlerService.cs` (or page-section crawl parser) — extract tools from h5 ul structure
- `GeekAPI/Services/Workflow/Services/PromptBuilders/ContentPromptBuilder.cs` — add TOOLS TO CONTEXTUALLY MENTION section
- `GeekAPI/Services/Workflow/Services/Export/SectionHtmlRenderer.cs` or new LinkRewriterService — auto-link tool mentions

**Frontend:**
- `src/lib/content-creator/hierarchy-match.ts` → `parseHierarchyToolNames()` — detect ul li a patterns (if feasible)
- No UI changes needed; tools flow through existing `HierarchyToolNames` field

## Implementation Sequencing

1. **Identify crawl schema** — confirm how tool links are represented in the crawled page-section tree (is it plain text, or preserved as `<a>` nodes?)
2. **Decide extraction layer** — fix in backend (crawl parsing) or frontend (text post-processing)?
3. **Tool context mapping** — how much context about each tool should the prompt receive? (name only, or name + h5 heading context?)
4. **Link rewriting** — simplest: post-generation regex replace; safer: LLM outputs links explicitly
5. **Test with crawled site** — verify tool mentions are natural and links work

## Risks

- **Over-linking:** Tool mention detection may false-positive on common words (e.g., "chatbot" vs. "ChatGPT")
  - *Mitigation:* Use word-boundary regex, exact-match-first strategy, manual link list as fallback
- **LLM ignores prompt:** Prompt section about tools may not influence mention placement
  - *Mitigation:* Include explicit examples; frame as "required context, not optional"
- **Crawl schema:** Tool links may not be preserved in page-section tree if it's text-only
  - *Mitigation:* Investigate `PageSectionNode` schema; if text-only, accept extraction limitations

## Success Criteria

- Tools from h4 → h5 → ul → li → p → a structure are extracted into `HierarchyToolNames`
- Generated pillar/blog body includes natural prose mentions of 2–4 tools (context-dependent)
- Each tool mention is linked to `/department/tool-{slug}` 
- Links are not false positives (no linking of "chatbot" to ChatGPT, etc.)
- Tool posts are generated before pillar, so links resolve
- Existing "dedicated tools section" generation (if any) remains unchanged; prose mentions are additive
