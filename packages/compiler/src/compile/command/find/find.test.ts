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
	expect(step.args.predicates).toEqual([
		{
			kind: 'name',
			pattern: literal('*.ts'),
		},
		{
			kind: 'type',
			types: ['f', 'd'],
		},
	]);
	expect(step.args.action).toEqual({
		explicit: true,
		kind: 'print',
	});
	expect(step.args.usageError).toBe(false);
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
