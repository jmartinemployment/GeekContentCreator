# Fix: duplicated body copy, and links that swallow a whole paragraph

**Status:** Reported, not yet fixed. Both live in **GeekAPI (not Node)**, in the same section-writing
path as `fix-duplicate-pillar-h2-sections.md` — which *is* fixed. These two are separate defects found
while hand-coding the AI Content Repurposing pillar into geekatyourspot.

## Defect 1 — a subsection is written twice, once flattened and once structured

The "Measuring Success in Content Repurposing" H2 emits each of its subsections **twice**:

1. as a bold pseudo-heading paragraph — `<p><strong>Key Performance Indicators (KPIs)…</strong></p>` —
   followed by its prose, inline in the parent section body;
2. again as a real `<h3>` child with the **identical** prose.

Result in `ai-content-repurposing.html`: **6 paragraphs and 3 list items duplicated verbatim.**

This is worse than the duplicate-H2 defect. Duplicate headings are an outline problem; this is
duplicated body copy on a page whose entire purpose is ranking.

Two tells that the flattened copy is the accident, not the `<h3>`:

- the pseudo-heading is a `<p><strong>` where every sibling subsection uses `<h3>` — the model wrote a
  heading it had no schema slot for;
- the `<h3>` version is complete and correctly nested, so dropping the flattened copy loses nothing.

Likely shape: the section writer returned the subsections **both** as prose inside the parent's
`paragraphs` and as entries in `children`. Worth checking whether `ParseSections` / the section JSON
contract lets a section carry a subsection in both places at once, and whether the batch prompt's
"Include 2-3 h3 subsections nested in `children`" is being satisfied *in addition to* the model
inlining them.

## Defect 2 — `<a>` wrapping an entire `<li>` or `<p>`

`ai-content-repurposing.html` also emits links whose anchor text is a whole sentence or bullet:

```html
<li><a href="/tools/marketing/jasper-ai">Reduced manual editing: With tools like Jasper AI, content
teams can automate the rewriting process, ensuring consistency and reducing the time spent on manual
edits. This allows writers to focus on more creative tasks, knowing that their content will maintain a
uniform voice across platforms.</a></li>

<p><a href="/tools/marketing/copyai">Geek At Your Spot helps organizations use AI tools like Copy.ai to
transform blog articles into engaging social media posts or detailed infographics. This process not
only saves time but also broadens the content&#39;s reach and impact.</a></p>
```

Anchor text should be the tool name. A 60-word hyperlink is bad for readers and gives Google sentence-
length anchor text pointing at a product page. The intended shape is the one the AI Content Creation
Workflow pillar produces — the tool name linked inline inside ordinary prose.

Likely shape: a `Run` with `Href` set is being applied across the whole paragraph's runs rather than
the run carrying the tool name. Worth checking how `Href` is assigned when the model marks a link.

## Where it appears

Scan of every export under `backup/` and `content-writer-output/`. `dupH2` is the already-fixed
defect, shown for context.

| export | h2 | dupH2 | dup copy | whole-element links |
|---|---:|---:|---:|---:|
| `marketing/AI Content Repurposing/ai-content-repurposing.html` | 6 | 0 | **9** | **10** |
| `accounting/intelligent-tax-compliance-regulations.html` | 6 | 0 | **9** | 0 |
| `marketing/ai-marketing-systems/old/ai-marketing-systems.html` | 7 | 0 | **20** | **45** |
| `marketing/Automated Content Generation/automated-content-generation.html` | 6 | 0 | 0 | 4 |
| `marketing/AI Content Creation Workflow/use-cases/…workflow.html` | 9 | 2 | 0 | 0 |
| `marketing/Automated Ad Spend Optimizatio/automated-ad-spend-optimization.html` | 7 | 1 | 0 | 0 |
| every blog export (9 files) | — | 0 | 0 | 1 each |

Notes on the table:

- `ai-marketing-systems/old/` is superseded by its clean sibling `ai-marketing-systems.html`; its 20/45
  are historical, not shipping.
- The accounting pillar's 9 duplicates never reached the site — the coded page at
  `/use-cases/accounting/tax-compliance-regulations` renders different, thinner content.
- **No live page currently carries duplicated copy from these defects.** A naive check flags
  `/use-cases/marketing/ai-content-creation-workflow` with 63 repeated blocks, but that page renders a
  mobile and a desktop copy of each section by design. Don't count rendered duplication as evidence;
  scan the export, not the page.
- Nearly every blog export has exactly one whole-element link — so defect 2 is systemic, not specific
  to pillars.

## Detection

```python
import re, html, collections, pathlib, sys

def txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()

for p in pathlib.Path(sys.argv[1]).rglob("*.html"):
    raw = p.read_text(encoding="utf-8", errors="ignore")
    if "<h1>" not in raw:
        continue
    body = raw[raw.find("<h1>"):]
    blocks = [txt(m.group(2)) for m in re.finditer(r"<(p|li)[^>]*>(.*?)</\1>", body, re.S)]
    blocks = [b for b in blocks if b]
    dup = sum(v - 1 for v in collections.Counter(blocks).values() if v > 1)
    whole = len(re.findall(r"<(li|p)>\s*<a [^>]*>.*?</a>\s*</\1>", body, re.S))
    if dup or whole:
        print(f"{p}: {dup} duplicated block(s), {whole} whole-element link(s)")
```

A `<p><strong>…</strong></p>` sitting among `<h3>` siblings is the tell for defect 1.

## Does anything need re-running?

**No — re-running now buys nothing.** Only the duplicate-H2 defect is fixed. Both defects here are
still live in GeekAPI, so a regenerated export would still contain them.

- **Automated Content Generation** — 0 duplicate H2, 0 duplicated copy, 4 whole-element links. Nothing
  the shipped fix would change. Handle the 4 links at code time by linking just the tool name.
- **AI Content Repurposing** — the only export with both defects at volume. Already coded into
  geekatyourspot with the flattened copy dropped and anchors narrowed to the tool name.
- The two exports with duplicate H2 (AI Content Creation Workflow, Automated Ad Spend Optimization) are
  the only ones the shipped fix would improve, and both are already hand-resolved in the site.

Re-run once **all three** defects are fixed, and only where the regenerated copy is actually wanted —
regeneration rewrites headings and ids, so the already-coded pages need diffing, not overwriting.

## Related

- `docs/plans/fix-duplicate-pillar-h2-sections.md` — the fixed sibling defect; same code path.
- `docs/plans/fix-generate-tools-h4-h5-harvest.md` — heading-level assumptions in the tools harvest.
