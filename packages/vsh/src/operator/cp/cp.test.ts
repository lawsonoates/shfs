import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import type { Record } from '../../record';
import { cp } from './cp';

test('cp copies file from source to destination', async () => {
	const fs = new MemoryFS();
	const sourceContent = 'Hello, world!';
	const sourcePath = '/source.txt';
	const destPath = '/dest.txt';

	fs.setFile(sourcePath, sourceContent);

	async function* createRecordStream(): AsyncIterable<Record> {
		yield { kind: 'file', path: sourcePath };
	}

	const sink = cp(fs, destPath);
	await sink(createRecordStream());

	const destContent = await fs.readFile(destPath);
	expect(new TextDecoder().decode(destContent)).toBe(sourceContent);
});
