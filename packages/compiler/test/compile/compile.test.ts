import { expect, test } from 'bun:test';

import { compile, compileEffect } from '@/compile/compile';
import { CompileError } from '@/diagnostic';
import {
	commandSub,
	compound,
	glob,
	type JobStatementIR,
	literal,
	type StatementIR,
	variable,
} from '@/ir';
import { parse } from '@/parser/parser';

function job(statement: StatementIR | undefined): JobStatementIR {
	if (statement?.kind !== 'job') {
		throw new Error('Expected a job statement');
	}
	return statement;
}

test('compile preserves output redirection on steps', () => {
	const ir = compile(parse('cat input.txt > output.txt'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'cat',
		redirections: [{ kind: 'output', target: literal('output.txt') }],
	});
});

test('compile preserves input redirection on steps', () => {
	const ir = compile(parse('head -n 1 < input.txt'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'head',
		redirections: [{ kind: 'input', target: literal('input.txt') }],
	});
});

test('compile supports pwd command', () => {
	const ir = compile(parse('pwd'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		args: {},
		cmd: 'pwd',
	});
});

test('compile supports cd command', () => {
	const ir = compile(parse('cd'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		args: { path: literal('/') },
		cmd: 'cd',
	});
});

test('compile preserves statement ordering in script IR', () => {
	const ir = compile(parse('pwd; cd /tmp\npwd'));
	expect(ir.statements).toHaveLength(3);
	expect(job(ir.statements[0]).pipeline.firstCommand?.name).toMatchObject(
		literal('pwd')
	);
	expect(job(ir.statements[1]).pipeline.firstCommand?.name).toMatchObject(
		literal('cd')
	);
	expect(job(ir.statements[2]).pipeline.firstCommand?.name).toMatchObject(
		literal('pwd')
	);
});

test('compile sets default statement chain metadata to always', () => {
	const ir = compile(parse('pwd; cd /tmp'));
	expect(ir.statements.map((statement) => statement.chainMode)).toEqual([
		'always',
		'always',
	]);
});

test('compile supports command substitution in argument position', () => {
	const ir = compile(parse('cd (echo subdir)'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'cd',
		args: {
			path: {
				kind: 'commandSub',
				command: 'echo subdir',
			},
		},
	});
});

test('compile preserves nested command substitution serialization', () => {
	const ir = compile(parse('echo (echo (echo nested))'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'echo',
		args: {
			values: [
				{
					kind: 'commandSub',
					command: 'echo (echo nested)',
				},
			],
		},
	});
});

// Pipe redirections inside command substitutions serialize once.
test('compile preserves pipe redirection serialization in command substitution', () => {
	const ir = compile(
		parse('echo (find /workspace /missing -maxdepth 0 2>| cat)')
	);

	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		args: {
			values: [
				commandSub('find /workspace /missing -maxdepth 0 2>| cat'),
			],
		},
		cmd: 'echo',
	});
});

test('compile preserves mixed glob words as compound arguments', () => {
	const ir = compile(parse('echo src/*.test.ts'));

	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'echo',
		args: {
			values: [
				compound([literal('src/'), glob('*'), literal('.test.ts')]),
			],
		},
	});
});

test('compile preserves mixed command substitution words with adjacent literals', () => {
	const ir = compile(parse('echo foo(echo bar)baz'));

	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'echo',
		args: {
			values: [
				compound([
					literal('foo'),
					commandSub('echo bar'),
					literal('baz'),
				]),
			],
		},
	});
});

test('compile keeps variable args for runtime expansion', () => {
	const ir = compile(parse('echo $status $PROJECT_ROOT'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		cmd: 'echo',
		args: {
			values: [variable('status'), variable('PROJECT_ROOT')],
		},
	});
});

test('compile preserves and/or chain metadata', () => {
	const ir = compile(parse('test 1 = 1; and echo pass; or echo fail'));
	expect(ir.statements.map((statement) => statement.chainMode)).toEqual([
		'always',
		'and',
		'or',
	]);
});

test('compile routes unknown commands to runtime call steps', () => {
	const ir = compile(parse('definitely-not-a-command arg1'));
	expect(job(ir.statements[0]).pipeline.steps[0]).toMatchObject({
		args: { name: 'definitely-not-a-command', words: [literal('arg1')] },
		cmd: 'call',
	});
});

test('compileEffect yields compile failures on the result error channel', () => {
	const result = compileEffect(parse('set -Z x'));
	expect(result.isErr()).toBeTrue();
	if (result.isErr()) {
		expect(result.error).toBeInstanceOf(CompileError);
	}
});
