import type { FS } from '../../fs/fs';
import type { FileRecord } from '../../record';
import type { Stream } from '../../stream';

export async function* ls(fs: FS, path: string): Stream<FileRecord> {
	for await (const p of fs.readdir(path)) {
		yield { kind: 'file', path: p };
	}
}
