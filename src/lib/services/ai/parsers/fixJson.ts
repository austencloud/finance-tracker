/**
 * Attempts to salvage almost‑JSON coming from the LLM.
 *  – trims leading / trailing junk
 *  – removes dangling commas  ,]
 *  – keeps trying until a valid JSON string is produced or returns null
 */
export function extractCleanJson(raw: string): string | null {
    if (!raw) return null;

    // 1. keep only the outer‑most {...}
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    let candidate = raw.slice(start, end + 1);

    // 2. kill BOM / strange characters
    candidate = candidate.replace(/^\uFEFF/, '');

    // 3. **NEW** – remove any comma before ] or }
    candidate = candidate.replace(/,\s*([}\]])/g, '$1');

    // 4. final sanity check
    try {
        JSON.parse(candidate);
        return candidate;
    } catch {
        return null;
    }
}
