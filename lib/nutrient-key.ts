/**
 * Which key opens the Nutrient Viewer API.
 *
 * A Nutrient account issues more than one key, one per product surface, and they
 * are not interchangeable: the Processor key answers `403 Forbidden` to every
 * Viewer request, including ones that name no document. Everything this app does
 * with Nutrient — sessions, documents, annotations, comments — is the Viewer API,
 * so the Viewer key is the only one it needs.
 *
 * Resolved in one place because "which variable holds the key" is a single fact.
 * It was previously repeated at each call site, which is how they came to disagree.
 */

export type NutrientKeyEnv = {
  NUTRIENT_VIEWER_API_KEY?: string;
  /** The name used before the keys were split by product surface. */
  NUTRIENT_API_KEY?: string;
};

export const resolveViewerApiKey = (env: NutrientKeyEnv): string => {
  // Falls back so an environment still carrying the single old name keeps
  // working across the rename rather than failing on deploy.
  const apiKey = env.NUTRIENT_VIEWER_API_KEY || env.NUTRIENT_API_KEY;

  if (!apiKey) {
    throw new Error(
      'No Nutrient Viewer API key configured: set NUTRIENT_VIEWER_API_KEY. ' +
        'Note this is not the Processor key — that one cannot reach the Viewer API.'
    );
  }

  return apiKey;
};

/** The key as configured in the running process. */
export const viewerApiKey = (): string =>
  resolveViewerApiKey({
    NUTRIENT_VIEWER_API_KEY: process.env.NUTRIENT_VIEWER_API_KEY,
    NUTRIENT_API_KEY: process.env.NUTRIENT_API_KEY,
  });
