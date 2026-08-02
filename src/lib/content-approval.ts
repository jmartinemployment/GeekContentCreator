/** Content approval gate for CWV2 projects (browser-local; survives tab close). */
export function contentApprovalKey(projectId: string): string {
  return `gcc.contentApproved.${projectId}`;
}

export function isContentApproved(projectId: string): boolean {
  try {
    return localStorage.getItem(contentApprovalKey(projectId)) === "1";
  } catch {
    return false;
  }
}

export function setContentApproved(projectId: string, approved: boolean): void {
  try {
    const key = contentApprovalKey(projectId);
    if (approved) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}
