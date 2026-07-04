const TRAILING_SLASH_REGEX = /\/+$/;
const MULTIPLE_SLASH_REGEX = /\/+/g;

export function normalizePath(path: string): string {
	if (path === '' || path === '/') {
		return '/';
	}
	const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
	const segments = withLeadingSlash
		.replace(TRAILING_SLASH_REGEX, '')
		.replace(MULTIPLE_SLASH_REGEX, '/')
		.split('/');
	const normalizedSegments: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') {
			continue;
		}
		if (segment === '..') {
			normalizedSegments.pop();
			continue;
		}
		normalizedSegments.push(segment);
	}
	return `/${normalizedSegments.join('/')}`;
}
