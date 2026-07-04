import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { cp } from '#shfs/operator/cp/cp';

test('cp copies file from source to destination', async () => {
	const fs = new MemoryFS();
	const sourceContent = 'Hello, world!';
	const sourcePath = '/source.txt';
	const destPath = '/dest.txt';

	fs.setFile(sourcePath, sourceContent);

	const effect = cp(fs);
	(
		await effect({ srcs: [sourcePath], dest: destPath, recursive: false })
	).unwrap();

	const destContent = await fs.readFile(destPath);
	expect(new TextDecoder().decode(destContent)).toBe(sourceContent);
});

test('cp recursively copies nested directory contents', async () => {
	const fs = new MemoryFS();
	await fs.makeDirectory('/source', { recursive: true });
	await fs.makeDirectory('/source/nested', { recursive: true });
	fs.setFile('/source/root.txt', 'root');
	fs.setFile('/source/nested/leaf.txt', 'leaf');

	const effect = cp(fs);
	(
		await effect({
			srcs: ['/source'],
			dest: '/dest',
			recursive: true,
		})
	).unwrap();

	expect(new TextDecoder().decode(await fs.readFile('/dest/root.txt'))).toBe(
		'root'
	);
	expect(
		new TextDecoder().decode(await fs.readFile('/dest/nested/leaf.txt'))
	).toBe('leaf');
});
