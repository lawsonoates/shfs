import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;
let fs!: MemoryFS;

const UTF8_ENCODER = new TextEncoder();

beforeEach(() => {
	fs = new MemoryFS();
	shell = new Shell(fs);
});

async function run(command: string): Promise<string> {
	return await shell.$`${command}`.text();
}

async function runBytes(command: string): Promise<Uint8Array> {
	return await shell.$`${command}`.bytes();
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

test('explicit function-body pipelines do not consume inherited stdin', async () => {
	const script = [
		'function consume',
		'    echo local | read inside',
		'    read outside',
		'    echo $inside:$outside',
		'end',
		'echo outer | consume',
	].join('\n');

	expect(await run(script)).toBe('local:outer');
});

test('partial line consumers leave exact inherited stdin for later commands', async () => {
	const expected = new Uint8Array([
		...UTF8_ENCODER.encode('first\n'),
		0xfe,
		0xff,
		0x0a,
	]);
	fs.setFile('/tmp/head-shared-input.bin', expected);
	const script = [
		'function consume',
		'    head -n 1',
		'    cat',
		'end',
		'cat /tmp/head-shared-input.bin | consume',
	].join('\n');

	expect(await runBytes(script)).toEqual(expected);
});

test('partial line consumers stream-decode split UTF-8 inherited stdin', async () => {
	const script = [
		'function produce',
		"    echo -ne '\\303'",
		"    echo -ne '\\277\\nrest\\n'",
		'end',
		'function consume',
		'    head -n 1',
		'    cat',
		'end',
		'produce | consume',
	].join('\n');

	expect(await runBytes(script)).toEqual(UTF8_ENCODER.encode('ÿ\nrest\n'));
});

test('nested functions share unread inherited stdin with their caller', async () => {
	const unreadSuffix = new Uint8Array([0xfe, 0xff, 0x0a]);
	fs.setFile(
		'/tmp/nested-shared-input.bin',
		new Uint8Array([...UTF8_ENCODER.encode('first\n'), ...unreadSuffix])
	);
	const script = [
		'function read_one',
		'    read value',
		'end',
		'function outer',
		'    read_one > /tmp/nested-read-output.txt',
		'    cat',
		'end',
		'cat /tmp/nested-shared-input.bin | outer',
	].join('\n');

	expect(await runBytes(script)).toEqual(unreadSuffix);
});

test('explicit nested-function pipelines stay isolated from inherited stdin', async () => {
	fs.setFile('/tmp/nested-function-input.txt', 'redirected\n');
	const script = [
		'function read_one',
		'    read value',
		'    echo $value',
		'end',
		'function outer',
		'    echo local | read_one',
		'    cat',
		'end',
		'echo outer | outer',
	].join('\n');

	expect(await run(script)).toBe('local\nouter');

	const redirectedScript = [
		'function outer_redirect',
		'    read_one < /tmp/nested-function-input.txt',
		'    cat',
		'end',
		'echo outer | outer_redirect',
	].join('\n');
	expect(await run(redirectedScript)).toBe('redirected\nouter');
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

test('command substitution stream-decodes adjacent byte records', async () => {
	expect(await run("echo (echo -ne '\\303'; echo -ne '\\277')")).toBe('ÿ');
});
