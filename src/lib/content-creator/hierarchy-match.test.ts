import {
  findHierarchyMatches,
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

console.log("hierarchy-match tests passed");
