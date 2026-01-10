import type { FS } from '../../fs/fs';
import type { FileRecord } from '../../record';
import type { Sink } from '../types';

export function rm(fs: FS): Sink<FileRecord, void> {
	return async (input) => {
		for await (const record of input) {
			await fs.delete(record.path);
		}
	};
}
