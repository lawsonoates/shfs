import type { FS } from '../../fs/fs';
import type { Record } from '../../record';
import type { Producer } from '../types';

export function ls(fs: FS, path: string): Producer<Record> {
	return async function* () {
		for await (const p of fs.list(path)) {
			yield { kind: 'file', path: p };
		}
	};
}
