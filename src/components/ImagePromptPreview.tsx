"use client";

export function ImagePromptPreview({ json }: { json: string }) {
  let pretty = json;
  try {
    pretty = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    /* keep raw */
  }
  return (
    <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-[var(--gcc-line)] bg-[var(--gcc-slate)] p-4 text-sm text-white/90">
      {pretty}
    </pre>
  );
}
