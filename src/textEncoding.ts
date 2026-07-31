/**
 * Repair strings corrupted by UTF-8 bytes being read as latin1 (mojibake),
 * including multi-pass cases like "ÃÂ¢ÃÂÃÂ¦" for "…".
 */
export function repairUtf8Mojibake(str: string): string {
	if (!str || typeof str !== 'string') {
		return str;
	}
	if (!/[ÃÂâ]/.test(str)) {
		return str;
	}

	let prev = str;
	for (let round = 0; round < 8; round++) {
		if (!/[ÃÂâ]/.test(prev)) {
			break;
		}
		try {
			const bytes = Buffer.from(prev, 'latin1');
			const next = bytes.toString('utf8');
			if (!next || next === prev || next.includes('\uFFFD')) {
				break;
			}
			prev = next;
		} catch {
			break;
		}
	}
	return prev;
}

/** Deep-repair string fields in plain JSON-like data. */
export function repairUtf8InData<T>(value: T): T {
	if (typeof value === 'string') {
		return repairUtf8Mojibake(value) as T;
	}
	if (Array.isArray(value)) {
		return value.map((item) => repairUtf8InData(item)) as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			out[key] = repairUtf8InData(nested);
		}
		return out as T;
	}
	return value;
}
