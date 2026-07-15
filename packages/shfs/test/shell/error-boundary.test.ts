import { beforeEach, expect, test } from 'bun:test';

import { MemoryFS } from '@/fs/memory';
import { Shell } from '@/shell/shell';

let shell!: Shell;

beforeEach(() => {
	shell = new Shell(new MemoryFS());
});

// Runs a command and returns the raw ShellOutput without throwing on non-zero exit.
async function run(command: string) {
	return await shell.$`${command}`.nothrow();
}

test('expansion failure in a statement does not abort the rest of the script', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; echo AFTER');

	expect(result.stdout.toString()).toBe('AFTER');
	expect(result.exitCode).toBe(0);
	expect(result.stderr.toString()).toContain(
		'no matches found: /w/none-*.txt'
	);
});

test('and-chain short-circuits after a failed command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; and echo AFTER');

	expect(result.stdout.toString()).toBe('');
	expect(result.exitCode).toBe(1);
});

test('or-chain recovers after a failed command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; or echo RECOVERED');

	expect(result.stdout.toString()).toBe('RECOVERED');
	expect(result.exitCode).toBe(0);
});

test("$status reflects a command's expansion failure", async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt; echo $status');

	expect(result.stdout.toString()).toBe('1');
});

test('variable indexes reject embedded redirections', async () => {
	const result = await run('set values first second; echo $values[1 >out]');

	expect(result.stdout.toString()).toBe('');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr.toString()).toContain('Invalid index value');
});

test('expanded index items preserve embedded whitespace boundaries', async () => {
	for (const command of [
		"set values first second; set index '1 2'; echo $values[$index]",
		"set values first second; echo $values[(echo '1 2')]",
	]) {
		const result = await run(command);
		expect(result.stdout.toString()).toBe('');
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain('Invalid index value');
	}
});

test('variable indexes do not glob wildcard atoms', async () => {
	const withoutMatch = await run('set values first second; echo $values[*]');
	expect(withoutMatch.stdout.toString()).toBe('');
	expect(withoutMatch.exitCode).not.toBe(0);
	expect(withoutMatch.stderr.toString()).toContain('Invalid index value');

	await run('touch /1');
	const withMatch = await run('set values first second; echo $values[*]');
	expect(withMatch.stdout.toString()).toBe('');
	expect(withMatch.exitCode).not.toBe(0);
	expect(withMatch.stderr.toString()).toContain('Invalid index value');
});

test('expanded index atoms are not recursively resolved', async () => {
	for (const indexExpression of ['$index', '\\$inner', "'$inner'"]) {
		const result = await run(
			`set values first second; set inner 2; set index '$inner'; echo $values[${indexExpression}]`
		);
		expect(result.stdout.toString()).toBe('');
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain('Invalid index value');
	}

	const directVariable = await run(
		'set values first second; set inner 2; echo $values[$inner]'
	);
	expect(directVariable.stdout.toString()).toBe('second');

	const commandSubstitution = await run(
		'set values first second; echo $values[(echo 2)]'
	);
	expect(commandSubstitution.stdout.toString()).toBe('second');
});

test('top-level index comments are not silently truncated', async () => {
	const topLevel = await run(
		'set values first second; echo $values[1 #ignored]'
	);
	expect(topLevel.stdout.toString()).toBe('');
	expect(topLevel.exitCode).not.toBe(0);
	expect(topLevel.stderr.toString()).toContain('Invalid index value');

	const nested = await run(`set values first second
echo $values[(echo 1 # ) ] "
)]`);
	expect(nested.stdout.toString()).toBe('first');
	expect(nested.exitCode).toBe(0);
	expect(nested.stderr.toString()).toBe('');
});

test('2> redirects an expansion-failure diagnostic to a file, not shell stderr', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('echo /w/none-*.txt 2> /w/err.txt');

	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);

	const errFile = await run('cat /w/err.txt');
	expect(errFile.stdout.toString()).toContain(
		'no matches found: /w/none-*.txt'
	);
});

test('2> redirects command read errors to a file, not shell stderr', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt 2> /w/stream-err.txt');

	expect(result.stdout.toString()).toBe('');
	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);

	const errFile = await run('cat /w/stream-err.txt');
	expect(errFile.stdout.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
});

test('2>| pipes stream collection failures to the next command', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('ls /w/missing 2>| wc -l');

	expect(result.stdout.toString()).toBe('1');
	expect(result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(1);
});

test('reading a missing file never throws from .nothrow()', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt');

	expect(result.exitCode).not.toBe(0);
	expect(result.stderr.toString()).not.toBe('');
});

test('a missing-file read reports an error but the script continues', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt; echo AFTER');

	expect(result.stdout.toString()).toBe('AFTER');
});

test('cat reports a missing file GNU-style and exits 1', async () => {
	await run('mkdir -p /w');
	await run('cd /w');

	const result = await run('cat /w/missing.txt');

	expect(result.stdout.toString()).toBe('');
	expect(result.stderr.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
	expect(result.exitCode).toBe(1);
});

test('cat keeps output from readable operands around a missing one', async () => {
	await run('mkdir -p /w');
	await run('cd /w');
	await run('echo hello > /w/a.txt');
	await run('echo world > /w/b.txt');

	const result = await run('cat /w/a.txt /w/missing.txt /w/b.txt');

	expect(result.stdout.toString()).toBe('hello\nworld\n');
	expect(result.stderr.toString()).toContain(
		'cat: /w/missing.txt: No such file or directory'
	);
	expect(result.exitCode).toBe(1);
});

test('stdout redirected to stderr preserves physical fragment adjacency', async () => {
	const unterminatedThenTerminated = await run(
		'echo -n first >&2; echo second >&2'
	);
	expect(unterminatedThenTerminated.stderr.toString()).toBe('firstsecond\n');

	const terminatedThenTerminated = await run(
		'echo first >&2; echo second >&2'
	);
	expect(terminatedThenTerminated.stderr.toString()).toBe('first\nsecond\n');

	const emptyFragment = await run(
		'echo -n first >&2; echo -n >&2; echo second >&2'
	);
	expect(emptyFragment.stderr.toString()).toBe('firstsecond\n');
});

// Fish basic.fish:158 emits exact 0xfe, while language.rst:159-179 and
// redirect.fish:108-115 require fd duplication to preserve the stream.
test('stdout redirected to stderr preserves exact bytes', async () => {
	const echoResult = await run("echo -ne '\\376' >&2");
	expect([...echoResult.stderr]).toEqual([0xfe]);

	await run('mkdir -p /w');
	await run("echo -ne '\\376\\377' > /w/binary");
	const catResult = await run('cat /w/binary >&2');
	expect([...catResult.stderr]).toEqual([0xfe, 0xff]);
});

test('raw stderr survives child fd routing', async () => {
	await run('mkdir -p /w');
	await run("function raw_stderr; echo -ne '\\376\\377' >&2; end");

	const fileResult = await run('raw_stderr 2> /w/raw.err; cat /w/raw.err');
	expect([...fileResult.stdout]).toEqual([0xfe, 0xff]);

	const stdoutResult = await run('raw_stderr 2>&1');
	expect([...stdoutResult.stdout]).toEqual([0xfe, 0xff]);

	const pipeResult = await run('raw_stderr 2>| cat');
	expect([...pipeResult.stdout]).toEqual([0xfe, 0xff]);
});

test('raw stderr keeps physical adjacency with diagnostics', async () => {
	await run('mkdir -p /w');
	const diagnostic = 'cat: /w/missing.txt: No such file or directory';

	const rawThenDiagnostic = await run(
		"echo -ne '\\376' >&2; cat /w/missing.txt"
	);
	expect(rawThenDiagnostic.stderr[0]).toBe(0xfe);
	expect(rawThenDiagnostic.stderr.subarray(1).toString()).toBe(diagnostic);

	const diagnosticThenRaw = await run(
		"cat /w/missing.txt; echo -ne '\\376' >&2"
	);
	expect(diagnosticThenRaw.stderr.at(-1)).toBe(0xfe);
	expect(diagnosticThenRaw.stderr.subarray(0, -1).toString()).toBe(
		`${diagnostic}\n`
	);
});

test('redirected stdout fragments remain adjacent to diagnostic stderr', async () => {
	await run('mkdir -p /w');
	const result = await run('echo -n prefix >&2; cat /w/missing.txt');

	expect(result.stderr.toString()).toBe(
		'prefixcat: /w/missing.txt: No such file or directory'
	);
});
