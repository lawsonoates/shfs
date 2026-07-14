import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

// shfs regression: upstream Fish has no direct function-redirection case.
test('function input redirection overrides pipeline stdin', async () => {
	await run('echo redirected > /tmp/function-input.txt');
	const script = [
		'function consume',
		'    read value',
		'    echo $value',
		'end',
		'echo pipeline | consume < /tmp/function-input.txt',
	].join('\n');

	expect(await run(script)).toBe('redirected');
});

test('function definitions persist across shell API invocations', async () => {
	await run('function keeper\n    echo kept\nend');
	expect(await run('keeper')).toBe('kept');
});

// Fish src/builtins/shared/misc.rs reads piped bytes with BufReader::read_until,
// so producer write boundaries do not create line boundaries.
test('line consumers join adjacent physical output fragments', async () => {
	const byteFragments = [
		'function bytes',
		"    echo -ne '\\141'",
		"    echo -ne '\\142\\n'",
		'end',
		'bytes | string length',
	].join('\n');
	expect(await run(byteFragments)).toBe('2');
	expect(await run(byteFragments.replace('string length', 'head -n 1'))).toBe(
		'ab'
	);

	const byteTail = [
		'function bytes',
		"    echo -ne '\\141'",
		"    echo -ne '\\142'",
		'end',
		'bytes | string length',
	].join('\n');
	expect(await run(byteTail)).toBe('2');

	const terminatedBytes = [
		'function bytes',
		"    echo -ne '\\141\\n'",
		"    echo -ne '\\142\\n'",
		'end',
		'bytes | string length',
	].join('\n');
	expect(await run(terminatedBytes)).toBe('1\n1');
});

test('line consumers join physical fragments across byte and line records', async () => {
	const byteThenLine = [
		'function mixed',
		"    echo -ne '\\141'",
		'    echo b',
		'end',
		'mixed | string length',
	].join('\n');
	expect(await run(byteThenLine)).toBe('2');

	const lineThenByte = [
		'function mixed',
		'    echo -n a',
		"    echo -ne '\\142\\n'",
		'end',
		'mixed | string length',
	].join('\n');
	expect(await run(lineThenByte)).toBe('2');
});
