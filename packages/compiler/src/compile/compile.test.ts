import { expect, test } from 'bun:test';

import { literal } from '@/ir';
import { parse } from '@/parser/parser';
import { compile } from './compile';

test('compile preserves output redirection on steps', () => {
	const ir = compile(parse('cat input.txt > output.txt'));
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
		cmd: 'cat',
		redirections: [{ kind: 'output', target: literal('output.txt') }],
	});
});

test('compile preserves input redirection on steps', () => {
	const ir = compile(parse('head -n 1 < input.txt'));
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
		cmd: 'head',
		redirections: [{ kind: 'input', target: literal('input.txt') }],
	});
});

test('compile supports pwd command', () => {
	const ir = compile(parse('pwd'));
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
		args: {},
		cmd: 'pwd',
	});
});

test('compile supports cd command', () => {
	const ir = compile(parse('cd'));
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
		args: { path: literal('/') },
		cmd: 'cd',
	});
});

test('compile preserves statement ordering in script IR', () => {
	const ir = compile(parse('pwd; cd /tmp\npwd'));
	expect(ir.statements).toHaveLength(3);
	expect(ir.statements[0]?.pipeline.firstCommand?.name).toMatchObject(
		literal('pwd')
	);
	expect(ir.statements[1]?.pipeline.firstCommand?.name).toMatchObject(
		literal('cd')
	);
	expect(ir.statements[2]?.pipeline.firstCommand?.name).toMatchObject(
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
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
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
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
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

test('compile keeps variable-like args for runtime expansion', () => {
	const ir = compile(parse('echo $status $PROJECT_ROOT'));
	expect(ir.statements[0]?.pipeline.steps[0]).toMatchObject({
		cmd: 'echo',
		args: { values: [literal('$status'), literal('$PROJECT_ROOT')] },
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
