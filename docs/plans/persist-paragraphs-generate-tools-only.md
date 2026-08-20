# Persist paragraph JSON and Generate Tools only

**Status:** Shipped serializer + hollow strip; tools-only generate/export extended in follow-on.

## Problem

`ProjectSnapshotSerializer` wrote `GeneratedContent.Body` without `ParagraphJsonConverter`. Abstract `Paragraph` became `{}` in `content_writer_v2.blobs.data`. WordCount on the row could still be hundreds (counted in RAM). HTML then had empty `<p></p>`.

## Persist (done)

1. `ParagraphJsonConverter` on project snapshots.
2. `SaveAsync` refuses a PUT when in-memory body has words and round-trip is ~0.
3. Hydrate strips rows with `Body` and zero words; saves cleaned project.

## Tools-only out of the app (same as pillar)

Generate tools (crawl Step 6 or names panel) → drafts on the project blob → **Export .html (.zip)** or **Commit to geekatyourspot** → files under `content-writer-output/tools/{slug}.html`. Then pull **geekatyourspot** if you want them in git.

Editorial Review / Export must show when `toolPosts` exist **without** a pillar. Pillar Export path is unchanged.

Do not re-run Analyze or Write Body just to unlock Export after a tools failure.
