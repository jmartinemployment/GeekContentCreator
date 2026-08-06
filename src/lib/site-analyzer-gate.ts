/** localStorage flag: Site Analyzer completed → Creates nav unlocked. */
export const SITE_ANALYZER_COMPLETED_KEY = "gcc.siteAnalyzerCompleted";
export const SITE_ANALYZER_COMPLETED_EVENT = "gcc:site-analyzer-completed";

export function markSiteAnalyzerCompleted(analysisId: string): void {
  try {
    localStorage.setItem(SITE_ANALYZER_COMPLETED_KEY, analysisId);
    window.dispatchEvent(new Event(SITE_ANALYZER_COMPLETED_EVENT));
  } catch {
    /* ignore */
  }
}

export function hasSiteAnalyzerCompleted(): boolean {
  try {
    return Boolean(localStorage.getItem(SITE_ANALYZER_COMPLETED_KEY));
  } catch {
    return false;
  }
}
