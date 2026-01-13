import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

export function rm(fs: FS): Effect<{ path: string; recursive: boolean }> {
	return async ({ path }) => {
		await fs.deleteFile(path);
	};
}
