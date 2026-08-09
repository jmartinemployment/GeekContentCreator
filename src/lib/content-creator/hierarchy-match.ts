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

function flattenWithPath(
  nodes: PageSectionNode[],
  ancestors: string[],
): { node: PageSectionNode; path: string[] }[] {
  const out: { node: PageSectionNode; path: string[] }[] = [];
  for (const node of nodes) {
    const path = [...ancestors, node.headingText];
    out.push({ node, path });
    if (node.children?.length) {
      out.push(...flattenWithPath(node.children, path));
    }
  }
  return out;
}

/**
 * Match keyword to a heading node: exact slug first, then either-direction contains.
 * Mirrors GccGenerateService.BuildMustMentionSubtopicsBlock matching rules.
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

  for (const page of trees) {
    for (const { node, path } of flattenWithPath(page.roots ?? [], [])) {
      const nodeSlug = slugifyHeading(node.headingText ?? "");
      if (!nodeSlug) continue;

      if (nodeSlug === topicSlug) {
        exact = { node, path, pageUrl: page.pageUrl };
        break;
      }

      if (
        !contains &&
        (nodeSlug.includes(topicSlug) || topicSlug.includes(nodeSlug))
      ) {
        contains = { node, path, pageUrl: page.pageUrl };
      }
    }
    if (exact) break;
  }

  const hit = exact ?? contains;
  if (!hit) return null;

  const childHeadings = (hit.node.children ?? [])
    .map((c) => c.headingText?.trim())
    .filter((t): t is string => !!t);

  return {
    path: hit.path,
    childHeadings,
    sourcePageUrl: hit.pageUrl,
    matchedHeading: hit.node.headingText,
  };
}
