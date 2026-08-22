# Fix duplicated body copy and whole-element links — implementation plan

Status: planned
Date: 2026-08-22

## Context

`docs/plans/fix-duplicated-body-copy-and-whole-element-links.md` reports two defects in the pillar
section-writing path, both marked "Reported, not yet fixed". They are the reason duplicate prose
keeps appearing in generated pages. Both live in GeekAPI, in the same code path as the
already-fixed duplicate-H2 defect (`fix-duplicate-pillar-h2-sections.md`).

**Defect 1 — a subsection is written twice.** The model emits each subsection *both* as a flattened
`<p><strong>Heading</strong></p>` plus prose inline in the parent's `paragraphs`, *and* as a real
`<h3>` child with identical prose. Measured by the report: 9 duplicated blocks in
`ai-content-repurposing.html`, 9 in `intelligent-tax-compliance-regulations.html`, 20 in the old
`ai-marketing-systems.html`.

Cause: `SectionJsonContract` (`ContentPromptBuilder.cs:214-217`) gives a section both `paragraphs`
and `children`, and nothing forbids the same content occupying both. The prompt asks for
subsections in `children` but never says "and do not also inline them".

**Defect 2 — a link swallows a whole paragraph or list item.** `Run(Text, Bold, Italic, Href)`
(`ContentDocument.cs:21`) lets the model set `Href` on the run carrying an entire sentence rather
than the run carrying the tool name. Report: 10 in ai-content-repurposing, 45 in the old
ai-marketing-systems, 4 in automated-content-generation, and one in nearly every blog export.

Outcome wanted: generated pages carry each subsection once, and anchor text is the tool name.

## Not verified yet

`content-writer-output/` is empty as of 2026-08-22 07:26, so none of the counts above have been
reproduced this session — they are the report's own numbers. The fix must be validated against
fixture documents built from the shapes the report quotes, and then against a real regenerated
export before being trusted.

## Approach

Repair in code after generation, matching the ownership rule already used by
`ContentDocumentText.AssignSectionIds` (`ContentDocumentText.cs:104`) and `PillarHeadingContract`:
the document's shape is decided in code, not by the model. Prompt wording alone has already failed
for this class of problem — the "Do not include a Tools H2" instruction was ignored repeatedly
earlier in this project.

Both passes must be **exact-match, never fuzzy**. Remove copy only when the text is
character-identical to text that survives elsewhere; narrow a link only when the tool name appears
verbatim in the anchor. Anything uncertain is left exactly as generated.

### Files

- **`GeekAPI/Services/Workflow/Services/ContentDocumentNormalizer.cs`** (new)
  - `Normalize(ContentDocument)` walks the tree bottom-up.
  - *Defect 1:* collect every descendant's paragraph text and heading; drop a parent paragraph
    whose normalized text matches descendant text, or which is entirely bold and matches a
    descendant heading (the pseudo-heading tell the report names).
  - *Defect 2:* when a run has an `Href` and its text exceeds a reasonable anchor length, recover
    the tool name from the href's own last path segment and split the run into
    unlinked / linked-name / unlinked. If the name is not found verbatim, leave the run
    untouched — never drop a link.
  - Reuses `SlugHelper.Slugify` (`SlugHelper.cs:7`) to match a word span against the href segment,
    so `/tools/marketing/jasper-ai` finds "Jasper AI" regardless of spacing or punctuation.

- **`GeekAPI/Services/Workflow/Services/ContentGenerationOrchestrator.cs`** — call `Normalize`
  immediately before `ContentDocumentText.AssignSectionIds` at `:159`. Order matters: dropping a
  duplicated subsection changes which headings exist, and `EnsureUniqueSlug` would otherwise mint
  `-2` ids for copies that are about to be removed.

- **`GeekBackend.Tests/ContentDocumentNormalizerTests.cs`** (new) — see Verification.

### Explicitly not doing

- No prompt change. The contract wording can be tightened later, but the repair must not depend on
  the model complying.
- No change to `SectionJsonContract`. Allowing `paragraphs` and `children` together is correct — a
  section legitimately has its own prose *and* subsections.
- No deduplication of tool names or hierarchy entries. That is the operator's call, not the code's.

## Verification

1. **Unit tests built from the report's own quoted shapes**, both directions:
   - a parent whose paragraphs repeat a child's prose → parent copy dropped, child untouched;
   - an all-bold paragraph matching a child heading → dropped;
   - a parent paragraph that merely *resembles* a child's → kept (no fuzzy removal);
   - `<li><a href="/tools/marketing/jasper-ai">Reduced manual editing: With tools like Jasper AI,
     …</a></li>` → anchor narrowed to "Jasper AI", surrounding text unlinked and unchanged;
   - an over-long anchor whose href segment does not appear in the text → left exactly as
     generated;
   - a short anchor already carrying just the tool name → untouched.
2. `dotnet build` and the full `GeekBackend.Tests` suite (59 passing as of commit `8d76594`).
3. Regenerate one pillar end to end, export it, and run the report's own detection script
   (`fix-duplicated-body-copy-and-whole-element-links.md`, "Detection") over the export. Expect
   `0 duplicated block(s), 0 whole-element link(s)`.
4. Compare the regenerated export against the previous one for that keyword to confirm nothing but
   the duplicated copy and the anchor spans changed.

## Follow-up, not in this change

The two docs referenced when this came up are themselves stale and misleading:
`fix-hierarchy-no-match-ai-workflow.md` carries a "Superseded — do not follow the diagnosis below"
banner above 160 lines of wrong diagnosis, and `fix-generate-tools-h4-h5-harvest.md` describes
fixes that were removed on 2026-08-20 and a symptom measured on a URL that 404s. Both cost real
time this session. Worth pruning the same way `PillarOutlineNormalizer` was — but separately.
