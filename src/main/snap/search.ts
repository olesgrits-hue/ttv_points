/** Types */
export interface LensResult {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface SnapUnavailableError {
  type: 'snap_unavailable';
  message: string;
}

const SNAP_BASE_URL = 'http://localhost:5645';
const SEARCH_ENDPOINT = `${SNAP_BASE_URL}/vc/v1/explorer/search`;
const MIN_QUERY_LENGTH = 3;
const REQUEST_TIMEOUT_MS = 3_000;

function isValidLens(item: unknown): item is LensResult {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['name'] === 'string';
}

/**
 * Client for snap-camera-server lens search endpoint.
 * Never throws — returns empty array or SnapUnavailableError on failure.
 */
export class SnapLensSearch {
  async search(query: string): Promise<LensResult[] | SnapUnavailableError> {
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }

    let res: Response;
    try {
      res = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, offset: 0, limit: 50 }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return {
        type: 'snap_unavailable',
        message: 'snap-camera-server not found at localhost:5645',
      };
    }

    if (!res.ok) {
      return {
        type: 'snap_unavailable',
        message: `snap-camera-server returned HTTP ${res.status}`,
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return [];
    }

    if (!Array.isArray(body)) return [];

    return body.filter(isValidLens);
  }
}
