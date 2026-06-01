const KEY_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function substitutePlaceholders(
	path: string,
	selectors: ReadonlyMap<string, number>,
): string {
	if (path.length === 0 || selectors.size === 0) return path;
	return path.replace(KEY_RE, (match, key: string) => {
		const value = selectors.get(key);
		return value === undefined ? match : String(value);
	});
}

export function extractPlaceholderKeys(path: string): string[] {
	if (path.length === 0) return [];
	const keys = new Set<string>();
	for (const m of path.matchAll(KEY_RE)) {
		keys.add(m[1]);
	}
	return [...keys];
}
