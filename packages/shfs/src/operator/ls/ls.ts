import type { FS } from '../../fs/fs';
import type { FileRecord } from '../../record';
import type { Stream } from '../../stream';

export interface LsOptions {
	showAll?: boolean;
}

function basename(path: string): string {
	const normalized = path.replace(/\/+$/g, '');
	const slashIndex = normalized.lastIndexOf('/');
	if (slashIndex === -1) {
		return normalized;
	}
	return normalized.slice(slashIndex + 1);
}

export async function* ls(
	fs: FS,
	path: string,
	options?: LsOptions
): Stream<FileRecord> {
	const showAll = options?.showAll ?? false;
	const stat = await fs.stat(path);
	if (!stat.isDirectory) {
		yield { kind: 'file', path };
		return;
	}

	for await (const childPath of fs.readdir(path)) {
		if (!showAll && basename(childPath).startsWith('.')) {
			continue;
		}
		yield { kind: 'file', path: childPath };
	}
}
