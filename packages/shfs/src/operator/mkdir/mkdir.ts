import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

export function mkdir(fs: FS): Effect<{
	path: string;
	recursive: boolean;
}> {
	return async ({ path, recursive }) => {
		await fs.mkdir(path, recursive);
	};
}
