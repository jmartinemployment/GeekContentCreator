# use-cases.tsx — drift between the two responsive copies

Generated 2026-08-20. **Corrected** — the first version of this file was wrong; see note at the end.

Method: live Playwright render (Pixel 7), reading `article#use-cases-section` from the **rendered
DOM**. Not from the JSX source.

- Copy 1 = `lg:hidden` (mobile) — `use-cases.tsx:25`
- Copy 2 = `hidden lg:block` (desktop) — `use-cases.tsx:1166`

| | headings | unique `/tools/` links |
|---|---|---|
| Copy 1 (mobile) | **57** | 95 |
| Copy 2 (desktop) | **56** | 95 |

**Tool links are identical (95 unique in each).** The drift is confined to heading wording.

## Actual differences

| mobile | desktop | note |
|---|---|---|
| `h3 Accounting` | `h3 Accounting Systems` | different section name |
| `h5 Outdated Spreadsheet Data::` | `h5 Outdated Spreadsheet Data:` | double colon typo on mobile |
| `h6 Top AI Lead Scoring Tools:` | `h6 Top AI Lead Tools:` | wording |
| `h6 Top AI Voice Assistance Tools:` | `h6 Top AI Voice Tools:` | wording |
| `h6 Top AI Content Creation Tools:` | *(absent)* | present on mobile only |

That is the whole drift: four wording mismatches and one heading missing from the desktop copy.

## Why it matters for Generate Tools

The two copies yield **different hierarchy path strings** for the same content
(`… › Accounting › …` vs `… › Accounting Systems › …`). `GccGenerateService.cs:687` compares the
joined path with exact case-insensitive equality, so which copy the matcher lands on changes
whether a saved path matches. This is a live cause of unpredictable matching, independent of the
`§2c` heading-drop bug.

Not a rendering or UX problem — both copies serve full content at their own breakpoint.

## Correction

The first version of this file claimed a **Customer Service** section and an
`h4 High volume, Limited Staff` existed in the desktop copy but not mobile. **That was wrong.**
Those lines (`use-cases.tsx:1751-1788`) are inside a `{/* … */}` JSX comment — already disabled,
rendered in neither copy.

Cause: that report was produced by regex-matching heading tags in the `.tsx` source, which counted
commented-out markup as live. `AGENTS.md` forbids exactly this ("Do not use regex to parse HTML")
and the failure mode was exactly the one the rule exists to prevent. The numbers above come from
the rendered DOM via `querySelectorAll` instead.
