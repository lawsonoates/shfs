import type { FS } from '../../fs/fs';
import type { Record } from '../../record';
import type { Producer } from '../types';

export function pwd(fs: FS): Producer<Record> {
	return async function* () {
		yield { kind: 'line', text: fs.cwd() };
	};
}
