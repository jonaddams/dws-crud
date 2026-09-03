// Global TypeScript declarations for the Nutrient API CRUD App

// The session shape used to be augmented here and again in
// types/next-auth.d.ts. Both are gone: `SessionUser` in lib/auth.ts is the
// single source of truth, and BetterAuth infers its own types from
// lib/auth-config.ts. What remains below is only the Nutrient Viewer surface.
export {};

// Nutrient Viewer API types

// The `export {}` above keeps this file a module, so these have to live inside
// `declare global` to be visible without an import.
declare global {
  /**
   * A person the mention menu can offer. `id` must be our own user ID: the SDK
   * hands the same value back through `Comment.getMentionedUserIds()`, so mentions
   * resolve to accounts without matching on names.
   */
  type NutrientMentionableUser = {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    avatarUrl?: string;
  };

  /**
   * Only the pieces of the viewer instance this app uses.
   *
   * The `comments.mention` payload is deliberately typed as `unknown`. The browser
   * is not trusted to report who was mentioned — the event is a nudge to make the
   * server re-read DWS, nothing more — so nothing here should be tempted to read it.
   */
  type NutrientViewerInstance = {
    addEventListener(event: 'comments.mention', handler: (payload: unknown) => void): void;
    removeEventListener(event: 'comments.mention', handler: (payload: unknown) => void): void;

    /**
     * Display name recorded on whatever this reader creates.
     *
     * Defaults to null, which the viewer renders as "Anonymous". The session JWT
     * carries `user_id`, so DWS already records *who* authored a comment; this is
     * the separate human-readable string shown beside it, and the SDK has no way
     * to know it otherwise.
     */
    setAnnotationCreatorName(name: string | null): void;
  };

  interface Window {
    NutrientViewer: {
      load(config: {
        container: HTMLElement;
        session: string;
        useCDN?: boolean; // Load assets from CDN instead of local. Requires viewer >= 1.9.1
        baseUrl?: string; // Custom base URL for self-hosted assets
        mentionableUsers?: NutrientMentionableUser[];
        [key: string]: unknown;
      }): Promise<NutrientViewerInstance>;
      unload(container: HTMLElement): Promise<void>;
    };
  }
}
