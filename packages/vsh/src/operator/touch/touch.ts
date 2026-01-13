import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

export function touch(fs: FS): Effect<{ files: string[] }> {
	return async ({ files }) => {
		for (const file of files) {
			if (!(await fs.exists(file))) {
				await fs.writeFile(file, new Uint8Array());
			}
		}
	};
}
