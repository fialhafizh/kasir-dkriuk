/** Tautan untuk hash router SvelteKit: '/admin' → '#/admin'. */
export function href(path: string): string {
	return `#${path.startsWith('/') ? path : `/${path}`}`;
}
