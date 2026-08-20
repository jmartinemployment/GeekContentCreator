import {
  findHierarchyMatches,
  findDuplicateMatches,
  matchKeywordToHierarchy,
  normalizeHierarchyMatchesFromApi,
  parseHierarchyTools,
  type PageContextPage,
} from "./hierarchy-match";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\n expected ${JSON.stringify(expected)}\n actual   ${JSON.stringify(actual)}`);
  }
}

const fiveAnchors = parseHierarchyTools(
  ["Zapier, QuickBooks, Lido, Jotform, UiPath."],
  [
    { text: "Zapier", href: "/tools/accounting/zapier" },
    { text: "QuickBooks", href: "/tools/accounting/quickbooks" },
    { text: "Lido", href: "/tools/accounting/lido" },
    { text: "Jotform", href: "/tools/accounting/jotform" },
    { text: "UiPath", href: "/tools/accounting/uipath" },
  ],
);
assertEqual(fiveAnchors.length, 5, "five comma-separated anchors");
assert(fiveAnchors.every((t) => typeof t.href === "string" && t.href.length > 0), "each tool has href");
assertEqual(
  fiveAnchors.map((t) => t.name),
  ["Zapier", "QuickBooks", "Lido", "Jotform", "UiPath"],
  "tool names",
);

const prose = parseHierarchyTools(
  ["Teams that already use Zapier for routing and QuickBooks for books should start here."],
  [
    { text: "Zapier", href: "/tools/zapier" },
    { text: "QuickBooks", href: "/tools/quickbooks" },
  ],
);
assertEqual(prose, [], "two inline links in prose are not a tool list");

const pages: PageContextPage[] = [
  {
    pageUrl: "https://example.com/accounting",
    headings: ["Accounting", "Top 5 Automated Data Entry Processing Tools:"],
    markdown: `# Accounting

###### Top 5 Automated Data Entry Processing Tools:

- [Zapier](/tools/zapier)
- [QuickBooks](/tools/quickbooks)
- [Lido](/tools/lido)
- [Jotform](/tools/jotform)
- [UiPath](/tools/uipath)
`,
  },
];

const match = matchKeywordToHierarchy(pages, "Accounting");
assert(match, "hierarchy match");
assertEqual(match.toolsByHeading.length, 1, "one tool group");
assertEqual(match.toolsByHeading[0]?.heading, "Top 5 Automated Data Entry Processing Tools:", "group heading");
assertEqual(match.toolsByHeading[0]?.tools.length, 5, "five tools with hrefs on the H6");
assert(match.assignmentMarkdown.includes("###### Top 5"), "assignment markdown is the heading slice");

// Regression: SQL hierarchy-match API shape for "AI Content Creation Workflow"
const apiMatches = normalizeHierarchyMatchesFromApi([
  {
    path: ["Services", "AI Content Creation Workflow"],
    childHeadings: ["Brief", "Generate"],
    sourcePageUrl: "https://geekatyourspot.com/services/ai-content",
    matchedHeading: "AI Content Creation Workflow",
    kind: "exact-heading",
    assignmentMarkdown: "## AI Content Creation Workflow\n\nDraft with Brief and Generate.\n",
  },
]);
assertEqual(apiMatches.length, 1, "one API match");
assertEqual(apiMatches[0]?.matchedHeading, "AI Content Creation Workflow", "exact heading");
assertEqual(apiMatches[0]?.kind, "exact-heading", "exact-heading kind");
assertEqual(apiMatches[0]?.childHeadings, ["Brief", "Generate"], "children");
assertEqual(
  normalizeHierarchyMatchesFromApi([]).length,
  0,
  "unknown keyword → empty matches (outside-scope checkbox)",
);
assertEqual(
  findHierarchyMatches(pages, "AI Content Creation Workflow").length,
  0,
  "markdown matcher does not invent AI workflow on unrelated pages",
);

// Regression: the "6 matches" report for Ad Spend Optimization.
// Same section crawled under www + bare host, and twin responsive copies, must collapse to one
// entry per distinct section — and the richer section must outrank the barren exact-slug one.
const adSpendPages = [
  {
    pageUrl: "https://www.geekatyourspot.com/use-cases/marketing/ai-marketing-systems",
    markdown: `# AI Marketing Systems

## Introduction to AI Marketing Systems

### Ad Spend Optimization

#### Predictive Analytics for Advertising
`,
  },
  {
    pageUrl: "https://geekatyourspot.com/use-cases/marketing/ai-marketing-systems",
    markdown: `# AI Marketing Systems

## Introduction to AI Marketing Systems

### Ad Spend Optimization

#### Predictive Analytics for Advertising
`,
  },
  {
    pageUrl: "https://www.geekatyourspot.com/",
    markdown: `# Redefine Your Business

## Artificial Intelligence Use Cases

### Marketing

#### Automated Ad Spend Optimization

##### Dynamic Creative Optimization:

###### Top AI Dynamic Optimization Tools:

- [Omneky](/tools/marketing/omneky)

##### Automated Rules & Bidding:

##### Real-Time Budget Reallocation:

##### Data Quality Assessments:
`,
  },
  {
    pageUrl: "https://geekatyourspot.com/",
    markdown: `# Redefine Your Business

## Artificial Intelligence Use Cases

### Marketing

#### Automated Ad Spend Optimization

##### Dynamic Creative Optimization:

###### Top AI Dynamic Optimization Tools:

- [Omneky](/tools/marketing/omneky)

##### Automated Rules & Bidding:

##### Real-Time Budget Reallocation:

##### Data Quality Assessments:
`,
  },
];

const adSpend = findHierarchyMatches(adSpendPages, "Ad Spend Optimization");
assertEqual(adSpend.length, 4, "duplicates are NOT collapsed - all matches are returned");
assertEqual(
  findDuplicateMatches(adSpend).length,
  2,
  "both duplicated sections are reported as crawl defects",
);
assertEqual(
  adSpend[0]?.matchedHeading,
  "Automated Ad Spend Optimization",
  "richest section ranks first, not the barren exact-slug heading",
);
assertEqual(adSpend[0]?.childHeadings.length, 5, "winning section keeps its child headings");
assertEqual(
  adSpend[adSpend.length - 1]?.matchedHeading,
  "Ad Spend Optimization",
  "barren exact match ranks last",
);

// Regression: the exact API payload behind the "6 matches" screen. This is the path the
// HierarchyContextPanel actually uses (normalizeHierarchyMatchesFromApi), which had no dedupe
// or ranking at all — it rendered whatever the API returned.
const homePath = [
  "Redefine Your Business",
  "Artificial Intelligence Use Cases",
  "Marketing",
  "Automated Ad Spend Optimization",
];
const barrenPath = [
  "AI Marketing Systems",
  "Introduction to AI Marketing Systems",
  "Ad Spend Optimization",
];
const apiSix = normalizeHierarchyMatchesFromApi([
  {
    path: barrenPath,
    childHeadings: ["Predictive Analytics for Advertising"],
    sourcePageUrl: "https://www.geekatyourspot.com/use-cases/marketing/ai-marketing-systems",
    matchedHeading: "Ad Spend Optimization",
    kind: "exact-heading",
    assignmentMarkdown: "### Ad Spend Optimization\n",
  },
  {
    path: barrenPath,
    childHeadings: ["Predictive Analytics for Advertising"],
    sourcePageUrl: "https://geekatyourspot.com/use-cases/marketing/ai-marketing-systems",
    matchedHeading: "Ad Spend Optimization",
    kind: "exact-heading",
    assignmentMarkdown: "### Ad Spend Optimization\n",
  },
  ...["https://www.geekatyourspot.com/", "https://www.geekatyourspot.com/", "https://geekatyourspot.com/", "https://geekatyourspot.com/"].map(
    (url) => ({
      path: homePath,
      childHeadings: [
        "Dynamic Creative Optimization:",
        "Automated Rules & Bidding:",
        "Real-Time Budget Reallocation:",
        "Data Quality Assessments:",
      ],
      sourcePageUrl: url,
      matchedHeading: "Automated Ad Spend Optimization",
      kind: "contains-heading" as const,
      assignmentMarkdown: "#### Automated Ad Spend Optimization\n",
    }),
  ),
]);

assertEqual(apiSix.length, 6, "all 6 API matches are returned - nothing is hidden");
const apiDupes = findDuplicateMatches(apiSix);
assertEqual(apiDupes.length, 2, "two duplicated sections reported");
assertEqual(
  apiDupes.reduce((n, d) => n + d.count, 0),
  6,
  "every duplicate row is accounted for in the report",
);
assertEqual(
  apiSix[0]?.matchedHeading,
  "Automated Ad Spend Optimization",
  "4-child section outranks the 1-child exact-slug match",
);
assertEqual(apiSix[0]?.childHeadings.length, 4, "winner keeps its 4 child headings");
assertEqual(
  apiSix[apiSix.length - 1]?.matchedHeading,
  "Ad Spend Optimization",
  "barren exact match ranks last",
);

console.log("hierarchy-match tests passed");
