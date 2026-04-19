import { expect, test } from 'bun:test';

import {
	type ExpandedWord,
	type FindStep,
	literal,
	type SimpleCommandIR,
} from '@/ir';
import { compileFind } from './find';

function findCommand(args: ExpandedWord[]): SimpleCommandIR {
	return {
		name: literal('find'),
		args,
		redirections: [],
	};
}

function mustBeFindStep(step: ReturnType<typeof compileFind>): FindStep {
	if (step.cmd !== 'find') {
		throw new Error(`Expected find step, received ${step.cmd}`);
	}
	return step;
}

test('compileFind defaults to cwd and implicit print action', () => {
	const step = mustBeFindStep(
		compileFind(findCommand([literal('-maxdepth'), literal('0')]))
	);

	expect(step.args.startPaths).toEqual([literal('.')]);
	expect(step.args.action).toEqual({
		explicit: false,
		kind: 'print',
	});
	expect(step.args.traversal).toEqual({
		depth: false,
		maxdepth: 0,
		mindepth: 0,
	});
	expect(step.args.usageError).toBe(false);
});

test('compileFind parses start paths and predicates in order', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('src'),
				literal('-name'),
				literal('*.ts'),
				literal('-type'),
				literal('f,d'),
				literal('-print'),
			])
		)
	);

	expect(step.args.startPaths).toEqual([literal('src')]);
	expect(step.args.predicateBranches).toEqual([
		[
			{
				kind: 'name',
				pattern: literal('*.ts'),
			},
			{
				kind: 'type',
				types: ['f', 'd'],
			},
		],
	]);
	expect(step.args.action).toEqual({
		explicit: true,
		kind: 'print',
	});
	expect(step.args.usageError).toBe(false);
});

test('compileFind parses -o into ordered predicate branches', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('src'),
				literal('-name'),
				literal('*.ts'),
				literal('-o'),
				literal('-name'),
				literal('*.js'),
			])
		)
	);

	expect(step.args.startPaths).toEqual([literal('src')]);
	expect(step.args.predicateBranches).toEqual([
		[
			{
				kind: 'name',
				pattern: literal('*.ts'),
			},
		],
		[
			{
				kind: 'name',
				pattern: literal('*.js'),
			},
		],
	]);
	expect(step.args.usageError).toBe(false);
});

test('compileFind treats -or as a synonym for -o', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('src'),
				literal('-name'),
				literal('*.ts'),
				literal('-or'),
				literal('-name'),
				literal('*.js'),
			])
		)
	);

	expect(step.args.startPaths).toEqual([literal('src')]);
	expect(step.args.predicateBranches).toEqual([
		[
			{
				kind: 'name',
				pattern: literal('*.ts'),
			},
		],
		[
			{
				kind: 'name',
				pattern: literal('*.js'),
			},
		],
	]);
	expect(step.args.usageError).toBe(false);
});

test('compileFind keeps traversal options global while parsing mixed AND/OR branches', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('src'),
				literal('-maxdepth'),
				literal('1'),
				literal('-name'),
				literal('*.ts'),
				literal('-type'),
				literal('f'),
				literal('-o'),
				literal('-name'),
				literal('*.test.ts'),
			])
		)
	);

	expect(step.args.predicateBranches).toEqual([
		[
			{
				kind: 'name',
				pattern: literal('*.ts'),
			},
			{
				kind: 'type',
				types: ['f'],
			},
		],
		[
			{
				kind: 'name',
				pattern: literal('*.test.ts'),
			},
		],
	]);
	expect(step.args.traversal).toEqual({
		depth: false,
		maxdepth: 1,
		mindepth: 0,
	});
	expect(step.args.usageError).toBe(false);
});

test('compileFind allows option-only sides of -o when traversal options are present', () => {
	const leftOptionOnly = mustBeFindStep(
		compileFind(
			findCommand([
				literal('.'),
				literal('-maxdepth'),
				literal('1'),
				literal('-o'),
				literal('-name'),
				literal('foo'),
			])
		)
	);
	const rightOptionOnly = mustBeFindStep(
		compileFind(
			findCommand([
				literal('.'),
				literal('-name'),
				literal('foo'),
				literal('-o'),
				literal('-maxdepth'),
				literal('1'),
			])
		)
	);

	expect(leftOptionOnly.args.usageError).toBe(false);
	expect(rightOptionOnly.args.usageError).toBe(false);
});

test('compileFind reports deterministic diagnostics for malformed -o placement', () => {
	const leading = mustBeFindStep(
		compileFind(
			findCommand([literal('-o'), literal('-name'), literal('*.ts')])
		)
	);
	const trailing = mustBeFindStep(
		compileFind(
			findCommand([literal('-name'), literal('*.ts'), literal('-o')])
		)
	);
	const repeated = mustBeFindStep(
		compileFind(
			findCommand([
				literal('-name'),
				literal('*.ts'),
				literal('-o'),
				literal('-o'),
				literal('-name'),
				literal('*.js'),
			])
		)
	);

	expect(leading.args.usageError).toBe(true);
	expect(
		leading.args.diagnostics.map((diagnostic) => diagnostic.message)
	).toEqual(['find: -o is missing a left predicate expression']);
	expect(leading.args.diagnostics[0]).toMatchObject({
		code: 'invalid-expression',
		location: expect.objectContaining({
			command: 'find',
			token: '-o',
			tokenIndex: 0,
		}),
	});

	expect(
		trailing.args.diagnostics.map((diagnostic) => diagnostic.message)
	).toEqual(['find: -o is missing a right predicate expression']);
	expect(
		repeated.args.diagnostics.map((diagnostic) => diagnostic.message)
	).toEqual(['find: -o is missing a left predicate expression']);
});

test('compileFind records deterministic diagnostics for invalid arguments', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('-type'),
				literal('f,f'),
				literal('-noop'),
				literal('tailing-operand'),
			])
		)
	);

	expect(step.args.usageError).toBe(true);
	expect(
		step.args.diagnostics.map((diagnostic) => diagnostic.message)
	).toEqual([
		'find: Duplicate file type in list argument to -type: f',
		'find: unknown predicate: -noop',
		'find: unexpected argument: tailing-operand',
	]);
	expect(step.args.diagnostics[0]).toMatchObject({
		code: 'invalid-value',
		location: expect.objectContaining({
			command: 'find',
			token: 'f,f',
			tokenIndex: 1,
		}),
		phase: 'compile',
		severity: 'error',
	});
});

test('compileFind records missing and non-numeric traversal arguments', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('/work'),
				literal('-mindepth'),
				literal('foo'),
				literal('-maxdepth'),
			])
		)
	);

	expect(step.args.usageError).toBe(true);
	expect(
		step.args.diagnostics.map((diagnostic) => diagnostic.message)
	).toEqual([
		'find: -mindepth: non-numeric argument: foo',
		'find: missing argument to -maxdepth',
	]);
});

test('compileFind records missing arguments for supported string predicates', () => {
	const tokens = [
		'-ipath',
		'-wholename',
		'-iwholename',
		'-regex',
		'-iregex',
	] as const;

	for (const token of tokens) {
		const step = mustBeFindStep(compileFind(findCommand([literal(token)])));

		expect(step.args.usageError).toBe(true);
		expect(
			step.args.diagnostics.map((diagnostic) => diagnostic.message)
		).toEqual([`find: missing argument to ${token}`]);
	}
});

test('compileFind accepts boolean constant predicates without arguments', () => {
	const step = mustBeFindStep(
		compileFind(
			findCommand([
				literal('.'),
				literal('-true'),
				literal('-o'),
				literal('-false'),
			])
		)
	);

	expect(step.args.usageError).toBe(false);
	expect(step.args.diagnostics).toHaveLength(0);
});
