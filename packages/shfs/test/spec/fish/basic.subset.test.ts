// Translated/adapted from fish-shell tests/checks/basic.fish.
// Source: https://github.com/fish-shell/fish-shell/tree/master/tests/checks/basic.fish
// Copyright (C) 2009- fish-shell contributors
// License: GNU General Public License, version 2.

// Note: basic.fish is a broad smoke test of fish syntax. This subset ports the
// if/else-if/else chains, begin blocks as conditions, lazy condition
// evaluation, break/continue behavior, and switch status preservation.
// Upstream cases built on `eval`, `contains`, dynamically-invoked loop
// controls, and process/job features are out of scope.

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

async function runResult(command: string) {
	const result = await shell.$`${command}`.nothrow();
	return {
		exitCode: result.exitCode,
		stderr: result.stderr.toString(),
		stdout: result.text(),
	};
}

// basic.fish: if true; echo alpha1.1 ... else if/else chain takes first branch
test('fish basic: basic.fish - if takes the first true branch', async () => {
	const script = [
		'if true',
		'    echo alpha1.1',
		'    echo alpha1.2',
		'else if false',
		'    echo beta1.1',
		'else',
		'    echo delta1.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('alpha1.1\nalpha1.2');
});

// basic.fish: else if begin ; true ; end
test('fish basic: basic.fish - begin block works as else if condition', async () => {
	const script = [
		'if false',
		'    echo alpha2.1',
		'else if begin ; true ; end',
		'    echo beta2.1',
		'    echo beta2.2',
		'else if begin ; echo nope2.1; false ; end',
		'    echo gamma2.1',
		'else',
		'    echo delta2.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('beta2.1\nbeta2.2');
});

// basic.fish: conditions run their side effects until a branch is taken
test('fish basic: basic.fish - else if conditions evaluate lazily in order', async () => {
	const script = [
		'if false',
		'    echo alpha3.1',
		'else if begin ; echo yep3.1; false ; end',
		'    echo beta3.1',
		'else if begin ; echo yep3.2; true ; end',
		'    echo gamma3.1',
		'else',
		'    echo delta3.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('yep3.1\nyep3.2\ngamma3.1');
});

// basic.fish: all conditions false falls through to else
test('fish basic: basic.fish - else runs after all conditions fail', async () => {
	const script = [
		'if false',
		'    echo alpha4.1',
		'else if begin ; echo yep4.1; false ; end',
		'    echo beta4.1',
		'else if begin ; echo yep4.2; false ; end',
		'    echo gamma4.1',
		'else',
		'    echo delta4.1',
		'end',
	].join('\n');
	expect(await run(script)).toBe('yep4.1\nyep4.2\ndelta4.1');
});

// basic.fish: else if not_a_valid_command but it should be OK because a
// previous branch was taken
test('fish basic: basic.fish - untaken else if branch may reference unknown commands', async () => {
	const script = [
		'if test ! -n "abc"',
		'else if test -n "def"',
		'    echo "epsilon5.2"',
		'else if not_a_valid_command but it should be OK because a previous branch was taken',
		'    echo "epsilon 5.3"',
		'else if test ! -n "abc"',
		'    echo "epsilon 5.4"',
		'end',
	].join('\n');
	expect(await run(script)).toBe('epsilon5.2');
});

// basic.fish: if not echo skip1 > /dev/null ... else if echo skip2 > /dev/null
test('fish basic: basic.fish - not with redirected builtin in if condition', async () => {
	const script = [
		'if not echo skip1 > /dev/null',
		'    echo "zeta 6.1"',
		'else if echo skip2 > /dev/null',
		'    echo "zeta 6.2"',
		'end',
	].join('\n');
	expect(await run(script)).toBe('zeta 6.2');
});

// basic.fish: continue skips to the next loop iteration.
// Adapted: upstream filters with `contains`; test provides the same gate.
test('fish basic: basic.fish - continue skips non-matching iterations', async () => {
	const script = [
		'for i in a b c d',
		'    if not test $i = c ; continue ; end',
		'    echo $i',
		'end',
	].join('\n');
	expect(await run(script)).toBe('c');
});

// basic.fish: break exits the loop at the first match.
test('fish basic: basic.fish - break exits the loop early', async () => {
	const script = [
		'for i in a b c d',
		'    echo $i',
		'    if test $i = b ; break ; end',
		'end',
	].join('\n');
	expect(await run(script)).toBe('a\nb');
});

// basic.fish: break outside a loop is an error
test('fish basic: basic.fish - break outside of a loop reports an error', async () => {
	const result = await runResult('break');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('break: Not inside of loop');
});

// basic.fish: continue outside a loop is an error
test('fish basic: basic.fish - continue outside of a loop reports an error', async () => {
	const result = await runResult('continue');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('continue: Not inside of loop');
});

// basic.fish:217-223: switch itself does not reset the incoming status before
// the selected case body starts.
test('fish basic: basic.fish - switch preserves status before its case body', async () => {
	const script = [
		'false',
		'switch one',
		'case one',
		'    echo $status',
		'end',
	].join('\n');
	expect(await run(script)).toBe('1');
});

// basic.fish:489-490: an unterminated switch is a parse error.
test('fish basic: basic.fish - switch requires a closing end', async () => {
	const result = await runResult('switch one\ncase one\n echo nope');
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain('end');
});

// basic.fish:11-17: comments on the command line and inside loop bodies.
test('fish basic: basic.fish - comments in odd places do not break loops', async () => {
	const script = [
		'for i in 1 2 # Comment on same line as command',
		'# Comment inside loop',
		'    for j in a b',
		'        # Double loop',
		'        echo $i$j',
		'    end;',
		'end',
	].join('\n');
	expect(await run(script)).toBe('1a\n1b\n2a\n2b');
});

// basic.fish:24: echo foo\ bar
test('fish basic: basic.fish - escaped space joins words', async () => {
	expect(await run('echo foo\\ bar')).toBe('foo bar');
});

// basic.fish:25-26: a backslash-newline continues the word.
test('fish basic: basic.fish - backslash-newline joins across lines', async () => {
	expect(await run('echo foo\\\nbar')).toBe('foobar');
});

// basic.fish:27-28: backslash-newline also joins inside double quotes.
test('fish basic: basic.fish - backslash-newline joins inside double quotes', async () => {
	expect(await run('echo "foo\\\nbar"')).toBe('foobar');
});

// basic.fish:29-30: single quotes keep the backslash and newline literal.
test('fish basic: basic.fish - single quotes keep backslash-newline literal', async () => {
	expect(await run("echo 'foo\\\nbar'")).toBe('foo\\\nbar');
});

// basic.fish:37-43: continuation before the for-loop word list.
test('fish basic: basic.fish - continuation before the for list', async () => {
	expect(await run('for i in \\\n    a b c\n    echo $i\nend')).toBe(
		'a\nb\nc'
	);
});

// basic.fish:118-123: return values above 255 clamp to 255.
test('fish basic: basic.fish - return above 255 clamps to 255', async () => {
	const script = [
		'function test_builtin_status_clamp_to_255',
		'    return 300',
		'end',
		'test_builtin_status_clamp_to_255',
		'echo $status',
	].join('\n');
	expect(await run(script)).toBe('255');
});

// basic.fish:175-178: a backslash at the end of a comment does not join lines.
test('fish basic: basic.fish - backslash inside a comment does not continue the line', async () => {
	expect(await run('echo visible # comment\\\necho second')).toBe(
		'visible\nsecond'
	);
});

// basic.fish:510-514: comments abut text only at word boundaries.
test('fish basic: basic.fish - # inside a word is not a comment', async () => {
	expect(await run('echo not#a#comment')).toBe('not#a#comment');
	expect(await run('echo is # a # comment')).toBe('is');
});

// basic.fish:554-556: a trailing escaped backslash inside a substitution.
test('fish basic: basic.fish - command substitution keeps a trailing escaped backslash', async () => {
	expect(await run('echo (echo hello\\\\)')).toBe('hello\\');
});

// basic.fish:558-567: comment text inside a substitution can contain a
// closing parenthesis or unmatched quote without closing the substitution.
test('fish basic: basic.fish - comments hide structural characters inside substitutions', async () => {
	expect(await run('echo (echo foo;#)\n)')).toBe('foo');
	expect(await run("echo (echo bar #'\n)")).toBe('bar');
	expect(await run('echo (#"\necho baz)')).toBe('baz');
});
