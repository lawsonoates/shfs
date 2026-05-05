import { dirname } from 'node:path';

import type { MemoryFS } from '../../../fs/memory';

export async function ensureDir(fs: MemoryFS, path: string): Promise<void> {
	if (path === '' || path === '/' || path === '.') {
		return;
	}
	if (await fs.exists(path)) {
		return;
	}
	await fs.mkdir(path, true);
}

export async function setTextFile(
	fs: MemoryFS,
	path: string,
	content: string
): Promise<void> {
	await ensureDir(fs, dirname(path));
	fs.setFile(path, content);
}
