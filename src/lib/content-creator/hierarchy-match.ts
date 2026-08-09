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

export type HierarchyMatch = {
  path: string[];
  childHeadings: string[];
  sourcePageUrl: string;
  matchedHeading: string;
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

/**
 * Match keyword to a heading node or page URL slug.
 * 1) Exact heading slug, 2) either-direction heading contains,
 * 3) page URL slug exact/contains → that page's root heading (or keyword as path).
 */
export function matchKeywordToHierarchy(
  trees: PageSectionTreePage[],
  keyword: string,
): HierarchyMatch | null {
  const topic = keyword.trim();
  if (!topic || trees.length === 0) return null;

  const topicSlug = slugifyHeading(topic);
  if (!topicSlug) return null;

  let exact: { node: PageSectionNode; path: string[]; pageUrl: string } | null = null;
  let contains: { node: PageSectionNode; path: string[]; pageUrl: string } | null = null;
  let pageHit: { node: PageSectionNode | null; path: string[]; pageUrl: string } | null =
    null;

  for (const page of trees) {
    const urlSlug = pageUrlSlug(page.pageUrl);
    const urlMatch = slugsMatch(urlSlug, topicSlug);
    if (urlMatch && !pageHit) {
      const roots = page.roots ?? [];
      const root = roots[0] ?? null;
      const rootText = root ? headingOf(root) : "";
      pageHit = {
        node: root,
        path: rootText ? [rootText] : [topic],
        pageUrl: page.pageUrl,
      };
      if (urlMatch === "exact" && root) {
        exact = { node: root, path: [rootText || topic], pageUrl: page.pageUrl };
      }
    }

    for (const { node, path } of flattenWithPath(page.roots ?? [], [])) {
      const nodeSlug = slugifyHeading(headingOf(node));
      if (!nodeSlug) continue;

      const kind = slugsMatch(nodeSlug, topicSlug);
      if (kind === "exact") {
        exact = { node, path, pageUrl: page.pageUrl };
        break;
      }
      if (kind === "contains" && !contains) {
        contains = { node, path, pageUrl: page.pageUrl };
      }
    }
    if (exact) break;
  }

  const hit =
    exact ??
    contains ??
    (pageHit?.node
      ? { node: pageHit.node, path: pageHit.path, pageUrl: pageHit.pageUrl }
      : null);

  if (!hit) {
    if (pageHit) {
      return {
        path: pageHit.path,
        childHeadings: [],
        sourcePageUrl: pageHit.pageUrl,
        matchedHeading: pageHit.path[pageHit.path.length - 1] ?? topic,
      };
    }
    return null;
  }

  const childHeadings = childrenOf(hit.node)
    .map((c) => headingOf(c))
    .filter((t): t is string => !!t);

  return {
    path: hit.path,
    childHeadings,
    sourcePageUrl: hit.pageUrl,
    matchedHeading: headingOf(hit.node) || hit.path[hit.path.length - 1] || topic,
  };
}
