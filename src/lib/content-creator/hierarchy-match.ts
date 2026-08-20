/** One crawled page as stored for Content Creator (not a nested HTML tree). */
export type PageContextPage = {
  pageUrl: string;
  headings?: string[] | null;
  markdown?: string | null;
  title?: string | null;
};

export type HierarchyMatchKind = "exact-heading" | "contains-heading" | "exact-page" | "contains-page";

export type ToolsByHeading = {
  heading: string;
  tools: Array<{ name: string; href?: string }>;
};

export type HierarchyMatch = {
  path: string[];
  childHeadings: string[];
  toolsByHeading: ToolsByHeading[];
  /** Markdown for the matched heading and its descendants — the assignment, not extra evidence. */
  assignmentMarkdown: string;
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

function compactAlnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

function parseMarkdownLinks(text: string): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = [];
  MD_LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK.exec(text)) !== null) {
    const name = (m[1] ?? "").trim();
    const href = (m[2] ?? "").trim();
    if (name && href) out.push({ text: name, href });
  }
  return out;
}

/**
 * A tool list is 2+ anchors that account for most of the node's non-whitespace
 * paragraph text (comma-separated names), not links embedded in prose.
 */
export function parseHierarchyTools(
  paragraphs: string[],
  links: Array<{ text: string; href: string }>,
): Array<{ name: string; href?: string }> {
  if (links.length < 2) return [];

  const unique: Array<{ name: string; href?: string }> = [];
  const seen = new Set<string>();
  for (const link of links) {
    const name = link.text.replace(/\s+/g, " ").trim();
    if (!name || name.length >= 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ name, href: link.href || undefined });
  }
  if (unique.length < 2) return [];

  const paraCompact = compactAlnum(paragraphs.join(" "));
  if (paraCompact.length === 0) return unique;

  const linkCompact = compactAlnum(unique.map((t) => t.name).join(" "));
  if (linkCompact.length === 0) return [];
  if (linkCompact.length / paraCompact.length < 0.6) return [];

  return unique;
}

type MdSection = {
  level: number;
  heading: string;
  path: string[];
  start: number;
  end: number;
};

function parseMarkdownSections(markdown: string): MdSection[] {
  const lines = markdown.split(/\r?\n/);
  const indexed: { level: number; heading: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    indexed.push({ level: m[1].length, heading: (m[2] ?? "").trim(), line: i });
  }

  const stack: { level: number; heading: string }[] = [];
  const sections: MdSection[] = [];
  for (let i = 0; i < indexed.length; i++) {
    const cur = indexed[i]!;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= cur.level)
      stack.pop();
    stack.push({ level: cur.level, heading: cur.heading });
    let end = lines.length;
    for (let j = i + 1; j < indexed.length; j++) {
      if (indexed[j]!.level <= cur.level) {
        end = indexed[j]!.line;
        break;
      }
    }
    sections.push({
      level: cur.level,
      heading: cur.heading,
      path: stack.map((s) => s.heading),
      start: cur.line,
      end,
    });
  }
  return sections;
}

function sliceMarkdown(markdown: string, start: number, end: number): string {
  return markdown.split(/\r?\n/).slice(start, end).join("\n").trim();
}

function childHeadingsOf(sections: MdSection[], index: number): string[] {
  const parent = sections[index];
  if (!parent) return [];
  const out: string[] = [];
  for (let i = index + 1; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.level <= parent.level) break;
    out.push(s.heading);
  }
  return out;
}

function toolsInSlice(slice: string, fallbackHeading: string): ToolsByHeading[] {
  const lines = slice.split(/\r?\n/);
  const result: ToolsByHeading[] = [];
  let currentHeading = fallbackHeading;
  let paraBuf: string[] = [];
  let links: Array<{ text: string; href: string }> = [];

  function flush() {
    if (links.length >= 2 && currentHeading) {
      const tools = parseHierarchyTools(paraBuf, links);
      const list = tools.length > 0 ? tools : uniqueToolLinks(links);
      if (list.length >= 2) {
        result.push({ heading: currentHeading, tools: list });
      }
    }
    paraBuf = [];
    links = [];
  }

  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (hm) {
      flush();
      currentHeading = (hm[2] ?? "").trim();
      continue;
    }
    const parsed = parseMarkdownLinks(line);
    if (parsed.length > 0) links.push(...parsed);
    const trimmed = line.replace(/^[-*]\s+/, "").trim();
    if (trimmed) paraBuf.push(trimmed.replace(/\[[^\]]+\]\([^)]+\)/g, "$1").replace(/\[|\]/g, ""));
  }
  flush();
  return result;
}

function uniqueToolLinks(links: Array<{ text: string; href: string }>): Array<{ name: string; href?: string }> {
  const unique: Array<{ name: string; href?: string }> = [];
  const seen = new Set<string>();
  for (const link of links) {
    const name = link.text.replace(/\s+/g, " ").trim();
    if (!name || name.length >= 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ name, href: link.href || undefined });
  }
  return unique;
}

function slugsMatch(a: string, b: string): "exact" | "contains" | null {
  if (!a || !b) return null;
  if (a === b) return "exact";
  if (a.includes(b) || b.includes(a)) return "contains";
  return null;
}

function toMatch(
  section: MdSection | null,
  markdown: string,
  sections: MdSection[],
  index: number,
  pageUrl: string,
  topic: string,
  kind: HierarchyMatchKind,
): HierarchyMatch {
  const path = section?.path?.length ? section.path : [topic];
  const slice = section ? sliceMarkdown(markdown, section.start, section.end) : markdown.trim();
  return {
    path,
    childHeadings: section ? childHeadingsOf(sections, index) : [],
    toolsByHeading: toolsInSlice(slice, section?.heading || topic),
    assignmentMarkdown: slice,
    sourcePageUrl: pageUrl,
    matchedHeading: section?.heading || path[path.length - 1] || topic,
    kind,
  };
}

/**
 * Same page under `www.` and bare host, and the twin responsive copies of one section, are the
 * same match. Normalize both axes so the list shows distinct sections, not crawl artefacts.
 */
function dedupeUrl(url: string): string {
  const trimmed = (url || "").trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function dedupePath(path: readonly string[]): string {
  return path.map((p) => p.replace(/\s+/g, " ").trim().toLowerCase()).join("\0");
}

function matchKey(m: HierarchyMatch): string {
  return `${dedupeUrl(m.sourcePageUrl)}\0${dedupePath(m.path)}\0${m.kind.startsWith("exact") ? "exact" : "contains"}`;
}

/**
 * Collapse crawl artefacts and rank by substance.
 *
 * The same section arrives multiple times: once per hostname the crawl saw (`www.` and bare), and
 * once per responsive copy of the markup. Those are one section, not six matches.
 *
 * Ranking puts child-heading count ahead of slug precision. An exact-slug heading with 1 child and
 * no tools is not a better answer than a contains-slug heading with 4 children and 17 tools.
 */
/** A section that appeared more than once — a crawl defect, reported rather than hidden. */
export type DuplicateMatchGroup = {
  readonly path: string;
  readonly sourcePageUrls: readonly string[];
  readonly count: number;
};

/**
 * Duplicates are an error, not something to collapse.
 *
 * One section must produce one match. More than one means the crawl is wrong — the same page
 * stored under two hostnames (canonical not honoured), or two responsive copies of the markup
 * both indexed. Silently keeping the "best" copy would hide the defect and leave the operator
 * choosing between rows that should not both exist.
 */
export function findDuplicateMatches(matches: readonly HierarchyMatch[]): DuplicateMatchGroup[] {
  const groups = new Map<string, HierarchyMatch[]>();
  for (const m of matches) {
    const key = `${dedupeUrl(m.sourcePageUrl)}\0${dedupePath(m.path)}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      path: g[0]!.path.join(" › "),
      sourcePageUrls: [...new Set(g.map((m) => m.sourcePageUrl))],
      count: g.length,
    }));
}

/**
 * Rank by substance, collapse nothing. An exact-slug heading with 1 child and no tools is not a
 * better answer than a contains-slug heading with 4 children and 17 tools.
 */
export function rankMatches(matches: readonly HierarchyMatch[]): HierarchyMatch[] {
  return [...matches].sort((a, b) => {
    const childDiff = b.childHeadings.length - a.childHeadings.length;
    if (childDiff !== 0) return childDiff;
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    const pathDiff = a.path.join(" › ").localeCompare(b.path.join(" › "));
    if (pathDiff !== 0) return pathDiff;
    return a.sourcePageUrl.localeCompare(b.sourcePageUrl);
  });
}

export function findHierarchyMatches(
  pages: PageContextPage[],
  keyword: string,
): HierarchyMatch[] {
  const topic = keyword.trim();
  if (!topic || pages.length === 0) return [];

  const topicSlug = slugifyHeading(topic);
  if (!topicSlug) return [];

  // Collect every match. Duplicates are a crawl defect for findDuplicateMatches to report, not
  // something to quietly collapse here.
  const found: HierarchyMatch[] = [];

  function consider(m: HierarchyMatch) {
    found.push(m);
  }

  for (const page of pages) {
    const markdown = page.markdown ?? "";
    const sections = parseMarkdownSections(markdown);
    const urlSlug = pageUrlSlug(page.pageUrl);
    const urlMatch = slugsMatch(urlSlug, topicSlug);
    if (urlMatch) {
      consider(
        toMatch(
          sections[0] ?? null,
          markdown,
          sections,
          0,
          page.pageUrl,
          topic,
          urlMatch === "exact" ? "exact-page" : "contains-page",
        ),
      );
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const kind = slugsMatch(slugifyHeading(section.heading), topicSlug);
      if (!kind) continue;
      consider(
        toMatch(
          section,
          markdown,
          sections,
          i,
          page.pageUrl,
          topic,
          kind === "exact" ? "exact-heading" : "contains-heading",
        ),
      );
    }
  }

  return rankMatches(found);
}

export function matchKeywordToHierarchy(
  pages: PageContextPage[],
  keyword: string,
): HierarchyMatch | null {
  return findHierarchyMatches(pages, keyword)[0] ?? null;
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

/** Normalize GeekAPI hierarchy-match DTO (camel or Pascal) into HierarchyMatch. */
export function normalizeHierarchyMatchFromApi(raw: unknown): HierarchyMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pathRaw = o.path ?? o.Path;
  const path = Array.isArray(pathRaw)
    ? pathRaw.map((p) => String(p)).filter(Boolean)
    : [];
  const childrenRaw = o.childHeadings ?? o.ChildHeadings;
  const childHeadings = Array.isArray(childrenRaw)
    ? childrenRaw.map((c) => String(c)).filter(Boolean)
    : [];
  const sourcePageUrl = String(o.sourcePageUrl ?? o.SourcePageUrl ?? "").trim();
  const matchedHeading = String(o.matchedHeading ?? o.MatchedHeading ?? "").trim();
  const kindRaw = String(o.kind ?? o.Kind ?? "").trim();
  const kind = (
    ["exact-heading", "contains-heading", "exact-page", "contains-page"] as const
  ).includes(kindRaw as HierarchyMatchKind)
    ? (kindRaw as HierarchyMatchKind)
    : "contains-heading";
  const assignmentMarkdown = String(
    o.assignmentMarkdown ?? o.AssignmentMarkdown ?? "",
  );
  if (!sourcePageUrl && path.length === 0 && !matchedHeading) return null;
  return {
    path: path.length > 0 ? path : matchedHeading ? [matchedHeading] : [],
    childHeadings,
    toolsByHeading: assignmentMarkdown
      ? toolsInSlice(assignmentMarkdown, matchedHeading || path[path.length - 1] || "")
      : [],
    assignmentMarkdown,
    sourcePageUrl,
    matchedHeading: matchedHeading || path[path.length - 1] || "",
    kind,
  };
}

export function normalizeHierarchyMatchesFromApi(body: unknown): HierarchyMatch[] {
  const arr = Array.isArray(body) ? body : [];
  return rankMatches(
    arr.map(normalizeHierarchyMatchFromApi).filter((m): m is HierarchyMatch => m !== null),
  );
}
