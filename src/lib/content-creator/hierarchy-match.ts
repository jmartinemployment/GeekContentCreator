/** Page-section tree node (mirrors Geek-SEO / GeekAPI PageSectionDto). */
export type PageSectionNode = {
  level: number;
  headingText: string;
  paragraphs?: string[] | null;
  children?: PageSectionNode[] | null;
};

export type PageSectionTreePage = {
  pageUrl: string;
  roots: PageSectionNode[];
};

export type HierarchyMatchKind = "exact-heading" | "contains-heading" | "exact-page" | "contains-page";

export type HierarchyMatch = {
  path: string[];
  childHeadings: string[];
  sourcePageUrl: string;
  matchedHeading: string;
  kind: HierarchyMatchKind;
};

const KIND_RANK: Record<HierarchyMatchKind, number> = {
  "exact-heading": 0,
  "exact-page": 1,
  "contains-heading": 2,
  "contains-page": 3,
};

/** Same deterministic slugify intent as GccGenerateService.Slugify. */
export function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Last meaningful path segment of a page URL as a slug (page “name”). */
export function pageUrlSlug(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return slugifyHeading(u.hostname);
    const last = parts[parts.length - 1] ?? "";
    const bare = last.replace(/\.(html?|aspx?|php)$/i, "");
    return slugifyHeading(decodeURIComponent(bare));
  } catch {
    return slugifyHeading(pageUrl);
  }
}

function headingOf(node: PageSectionNode): string {
  return (node.headingText ?? (node as { HeadingText?: string }).HeadingText ?? "").trim();
}

function childrenOf(node: PageSectionNode): PageSectionNode[] {
  return node.children ?? (node as { Children?: PageSectionNode[] }).Children ?? [];
}

function flattenWithPath(
  nodes: PageSectionNode[],
  ancestors: string[],
): { node: PageSectionNode; path: string[] }[] {
  const out: { node: PageSectionNode; path: string[] }[] = [];
  for (const node of nodes) {
    const text = headingOf(node);
    const path = text ? [...ancestors, text] : ancestors;
    out.push({
      node,
      path: path.length ? path : ancestors.length ? ancestors : [text || "(untitled)"],
    });
    const kids = childrenOf(node);
    if (kids.length) {
      out.push(...flattenWithPath(kids, path.length ? path : ancestors));
    }
  }
  return out;
}

function slugsMatch(a: string, b: string): "exact" | "contains" | null {
  if (!a || !b) return null;
  if (a === b) return "exact";
  if (a.includes(b) || b.includes(a)) return "contains";
  return null;
}

function toMatch(
  node: PageSectionNode | null,
  path: string[],
  pageUrl: string,
  topic: string,
  kind: HierarchyMatchKind,
): HierarchyMatch {
  const childHeadings = node
    ? childrenOf(node)
        .map((c) => headingOf(c))
        .filter((t): t is string => !!t)
    : [];
  return {
    path,
    childHeadings,
    sourcePageUrl: pageUrl,
    matchedHeading: (node ? headingOf(node) : "") || path[path.length - 1] || topic,
    kind,
  };
}

function matchKey(m: HierarchyMatch): string {
  return `${m.sourcePageUrl}\0${m.path.join("\0")}\0${m.kind.startsWith("exact") ? "exact" : "contains"}`;
}

/**
 * All keyword matches against heading nodes and page URL slugs, ranked best-first.
 * Dedupes the same path+page (keeps stronger kind).
 */
export function findHierarchyMatches(
  trees: PageSectionTreePage[],
  keyword: string,
): HierarchyMatch[] {
  const topic = keyword.trim();
  if (!topic || trees.length === 0) return [];

  const topicSlug = slugifyHeading(topic);
  if (!topicSlug) return [];

  const byKey = new Map<string, HierarchyMatch>();

  function consider(m: HierarchyMatch) {
    const key = `${m.sourcePageUrl}\0${m.path.join("\0")}`;
    const prev = byKey.get(key);
    if (!prev || KIND_RANK[m.kind] < KIND_RANK[prev.kind]) {
      byKey.set(key, m);
    }
  }

  for (const page of trees) {
    const urlSlug = pageUrlSlug(page.pageUrl);
    const urlMatch = slugsMatch(urlSlug, topicSlug);
    if (urlMatch) {
      const roots = page.roots ?? [];
      const root = roots[0] ?? null;
      const rootText = root ? headingOf(root) : "";
      consider(
        toMatch(
          root,
          rootText ? [rootText] : [topic],
          page.pageUrl,
          topic,
          urlMatch === "exact" ? "exact-page" : "contains-page",
        ),
      );
    }

    for (const { node, path } of flattenWithPath(page.roots ?? [], [])) {
      const nodeSlug = slugifyHeading(headingOf(node));
      if (!nodeSlug) continue;

      const kind = slugsMatch(nodeSlug, topicSlug);
      if (!kind) continue;
      consider(
        toMatch(
          node,
          path,
          page.pageUrl,
          topic,
          kind === "exact" ? "exact-heading" : "contains-heading",
        ),
      );
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    return a.path.join(" › ").localeCompare(b.path.join(" › "));
  });
}

/**
 * Best single match (exact heading → exact page → contains heading → contains page).
 * Prefer {@link findHierarchyMatches} when the operator may need to choose.
 */
export function matchKeywordToHierarchy(
  trees: PageSectionTreePage[],
  keyword: string,
): HierarchyMatch | null {
  return findHierarchyMatches(trees, keyword)[0] ?? null;
}

export function hierarchyMatchId(m: HierarchyMatch): string {
  return matchKey(m);
}

export function hierarchyMatchKindLabel(kind: HierarchyMatchKind): string {
  switch (kind) {
    case "exact-heading":
      return "Exact heading";
    case "contains-heading":
      return "Heading contains keyword";
    case "exact-page":
      return "Exact page URL";
    case "contains-page":
      return "Page URL contains keyword";
  }
}
