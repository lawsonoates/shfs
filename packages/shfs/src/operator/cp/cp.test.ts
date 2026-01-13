import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { cp } from './cp';

test('cp copies file from source to destination', async () => {
	const fs = new MemoryFS();
	const sourceContent = 'Hello, world!';
	const sourcePath = '/source.txt';
	const destPath = '/dest.txt';

	fs.setFile(sourcePath, sourceContent);

	const effect = cp(fs);
	await effect({ src: sourcePath, dest: destPath, recursive: false });

	const destContent = await fs.readFile(destPath);
	expect(new TextDecoder().decode(destContent)).toBe(sourceContent);
});
