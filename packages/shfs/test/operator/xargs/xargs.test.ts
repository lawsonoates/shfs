import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let fs!: MemoryFS;
let shell!: Shell;

beforeEach(() => {
	fs = new MemoryFS();
	shell = new Shell(fs);
});

test('xargs fails on unterminated quote instead of executing malformed input', async () => {
	fs.setFile('/tmp/unterminated-quote.txt', '"abc');

	const result = await shell.$`xargs < /tmp/unterminated-quote.txt`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
});

test('xargs fails on dangling escape instead of executing malformed input', async () => {
	fs.setFile('/tmp/dangling-escape.txt', 'abc\\');

	const result = await shell.$`xargs < /tmp/dangling-escape.txt`.nothrow();

	expect(result.exitCode).toBe(1);
	expect(result.text()).toBe('');
});
