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

test('switch preserves status until a case body changes it', async () => {
	const matched = [
		'false',
		'switch one',
		'case one',
		'    echo $status',
		'end',
	].join('\n');
	const unmatched = [
		'false',
		'switch one',
		'case two',
		'    true',
		'end',
		'echo $status',
	].join('\n');

	expect(await run(matched)).toBe('1');
	expect(await run(unmatched)).toBe('1');
});

test('switch creates one local scope for patterns and the selected body', async () => {
	const script = [
		'set -g color outer',
		'switch green',
		'case (set -l color pattern; echo green)',
		'    echo $color',
		'    set -l color body',
		'    echo $color',
		'end',
		'echo $color',
	].join('\n');

	expect(await run(script)).toBe('pattern\nbody\nouter');
});

test('nested switches propagate break to an enclosing loop', async () => {
	const script = [
		'for item in one two three',
		'    switch $item',
		'    case one',
		'        echo one',
		'    case two',
		'        switch stop',
		'        case stop',
		'            break',
		'        end',
		'    case three',
		'        echo three',
		'    end',
		'end',
	].join('\n');

	expect(await run(script)).toBe('one');
});

test('switch expands visited patterns and stops after the first match', async () => {
	const script = [
		'set -g seen start',
		'switch target',
		'case (set -g seen checked; echo other)',
		'    echo nope',
		'case target',
		'    echo $seen',
		'case (set -g seen late; echo "*")',
		'    echo nope',
		'end',
		'echo $seen',
	].join('\n');

	expect(await run(script)).toBe('checked\nchecked');
});

test('switch wildcard patterns match across path separators', async () => {
	const script = ['switch a/b', 'case "a?b"', '    echo pass', 'end'].join(
		'\n'
	);

	expect(await run(script)).toBe('pass');
});

test('switch wildcard patterns match multiline values', async () => {
	const script = [
		'switch "$(echo first; echo second)"',
		'case "*second"',
		'    echo pass',
		'end',
	].join('\n');

	expect(await run(script)).toBe('pass');
});

test('switch command-scoped assignments do not escape the block', async () => {
	const script = [
		'set -g choice outer',
		'choice=green switch $choice',
		'case green',
		'    echo matched',
		'end',
		'echo $choice',
	].join('\n');

	expect(await run(script)).toBe('matched\nouter');
});

test('not negates the selected switch body status', async () => {
	const script = [
		'not switch one',
		'case one',
		'    false',
		'end',
		'and echo pass',
	].join('\n');

	expect(await run(script)).toBe('pass');
});
