import { expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

test('--prune removes directories made empty by -I exclusions', async () => {
	const fs = new MemoryFS();
	const shell = new Shell(fs);

	await fs.makeDirectory('/workspace/empty-after-exclude', {
		recursive: true,
	});
	await fs.makeDirectory('/workspace/kept', { recursive: true });
	fs.setFile('/workspace/empty-after-exclude/hidden.log', '');
	fs.setFile('/workspace/kept/visible.txt', '');

	const output = await shell.$`tree --prune -I '*.log' /workspace`.text();

	expect(output).toContain('kept');
	expect(output).toContain('visible.txt');
	expect(output).not.toContain('empty-after-exclude');
	expect(output).not.toContain('hidden.log');
});

test('does not descend into a symlinked directory', async () => {
	const fs = new MemoryFS();
	const shell = new Shell(fs);

	await fs.makeDirectory('/workspace/dir', { recursive: true });
	fs.setFile('/workspace/dir/file.txt', '');
	await fs.symlink('.', '/workspace/dir/self');

	const output = await shell.$`tree -F -L 2 /workspace/dir`.text();

	expect(output.match(/file\.txt/g)?.length ?? 0).toBe(1);
	expect(output.match(/self@/g)?.length ?? 0).toBe(1);
});
