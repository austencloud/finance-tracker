// fixJson.ts – zero‑dependency helper
export function extractCleanJson(raw: string): string | null {
	// 1  If the model fenced the JSON, prefer that.
	const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	const body = fence ? fence[1] : raw;

	// 2  Cut everything before the FIRST “{” or “[”
	const start = body.search(/[{[]/);
	if (start === -1) return null;

	// 3  Cut everything AFTER the matching closing brace/bracket.
	//     We walk the string once, counting brackets – O(n) but tiny.
	let depth = 0,
		end = -1;
	for (let i = start; i < body.length; i++) {
		if (body[i] === '{' || body[i] === '[') depth++;
		if (body[i] === '}' || body[i] === ']') {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end === -1) return null;

	return body.slice(start, end);
}
