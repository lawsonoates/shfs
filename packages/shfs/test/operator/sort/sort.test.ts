import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let fs!: MemoryFS;
let $!: Shell['$'];

beforeEach(() => {
	fs = new MemoryFS();
	$ = new Shell(fs).$;
});

test('sort -u with keys keeps the first representative for each equal key', async () => {
	fs.setFile('/in', 'b A\na A\nc B\n');

	expect(await $`sort -u -k2,2 /in`.text()).toBe('b A\nc B');
});

test('sort -u with global numeric ordering keeps the first representative', async () => {
	fs.setFile('/in', '1\n01\n2\n');

	expect(await $`sort -u -n /in`.text()).toBe('1\n2');
});

test('sort reads redirected stdin for dash file operands', async () => {
	fs.setFile('/in', 'b\na\n');

	expect(await $`sort - < /in`.text()).toBe('a\nb');
});

test('sort -n compares large numeric prefixes without Number precision loss', async () => {
	const smaller = '9'.repeat(400);
	const larger = `1${'0'.repeat(400)}`;
	fs.setFile('/in', `${larger}\n${smaller}\n`);

	expect(await $`sort -n /in`.text()).toBe(`${smaller}\n${larger}`);
});

test('sort -k supports numeric ordering as an in-scope key suffix', async () => {
	fs.setFile('/in', 'x 11\nx 2\n');

	expect(await $`sort -k2,2n /in`.text()).toBe('x 2\nx 11');
});

test('sort -k default fields do not shift on leading blanks', async () => {
	fs.setFile('/in', '  a z\nb c\n');

	expect(await $`sort -k2,2 /in`.text()).toBe('b c\n  a z');
});

test('sort -n does not recognize a leading plus sign', async () => {
	fs.setFile('/in', '+2\n1\n2\n');

	expect(await $`sort -n /in`.text()).toBe('+2\n1\n2');
});

test('sort rejects empty and multi-character field separators', async () => {
	fs.setFile('/in', 'x:a\nx:b\n');

	const emptySeparator = await $`sort -t '' -k2,2 /in`.nothrow();
	const multiCharacterSeparator = await $`sort -tab -k2,2 /in`.nothrow();

	expect(emptySeparator.exitCode).toBe(2);
	expect(emptySeparator.stderr.toString()).toContain('empty tab');
	expect(multiCharacterSeparator.exitCode).toBe(2);
	expect(multiCharacterSeparator.stderr.toString()).toContain(
		'multi-character tab'
	);
});

test('sort -c and -C are incompatible across separate arguments', async () => {
	fs.setFile('/in', 'a\n');

	const result = await $`sort -c -C /in`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain(
		"options '-cC' are incompatible"
	);
});

test('sort check mode accepts at most one file operand', async () => {
	fs.setFile('/left', 'a\n');
	fs.setFile('/right', 'b\n');

	const result = await $`sort -c left right`.nothrow();

	expect(result.exitCode).toBe(2);
	expect(result.stderr.toString()).toContain(
		"extra operand 'right' not allowed with -c"
	);
});

test('sort default ordering compares UTF-8 bytes rather than UTF-16 units', async () => {
	fs.setFile('/in', '😀\n￿\n');

	expect(await $`sort /in`.text()).toBe('￿\n😀');
});
