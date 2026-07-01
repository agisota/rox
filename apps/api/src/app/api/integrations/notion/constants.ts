/**
 * Notion REST API constants.
 *
 * The Notion sync foundation talks to the public Notion REST API directly (no
 * SDK dependency) so the network surface stays small and fully mockable in
 * tests. `NOTION_VERSION` pins the API revision Notion requires on every request
 * via the `Notion-Version` header.
 */

/** Base URL for the Notion REST API. */
export const NOTION_API_BASE = "https://api.notion.com/v1";

/**
 * Notion API version sent in the `Notion-Version` header. Pinned so response
 * shapes stay stable; bump deliberately when adopting a newer revision.
 */
export const NOTION_VERSION = "2022-06-28";

/** Default `POST /search` body — overridable per call (see notion-client). */
export const NOTION_DEFAULT_SEARCH_QUERY = "";
