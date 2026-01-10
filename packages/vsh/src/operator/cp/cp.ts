import type { FS } from '../../fs/fs';
import type { Record } from '../../record';
import type { Sink } from '../types';

export function cp(fs: FS, dest: string): Sink<Record, void> {
	return async (input) => {
		for await (const record of input) {
			if (record.kind === 'file') {
				const content = await fs.readFile(record.path);
				await fs.writeFile(dest, content);
			}
		}
	};
}
