import { expect, test } from 'bun:test';

import { MemoryFS } from '../../fs/memory';
import { pwd } from './pwd';

test('pwd yields current working directory', async () => {
	const fs = new MemoryFS();
	const cwdPath = '/home/user';

	fs.setCwd(cwdPath);

	const lines: string[] = [];
	const producer = pwd(fs);
	for await (const record of producer()) {
		if (record.kind === 'line') {
			lines.push(record.text);
		}
	}

	expect(lines).toEqual([cwdPath]);
	expect(lines[0]).toBe(cwdPath);
});
