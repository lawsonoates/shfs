import { expect, test } from 'bun:test';

import { MemoryFS } from '#shfs/fs/memory';
import { Shell } from '#shfs/shell/shell';

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
