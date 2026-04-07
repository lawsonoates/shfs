import { expect, test } from 'bun:test';

import {
	type ExpandedWord,
	type GrepStep,
	literal,
	type SimpleCommandIR,
} from '@/ir';
import { compileGrep } from './grep';

function grepCommand(args: ExpandedWord[]): SimpleCommandIR {
	return {
		name: literal('grep'),
		args,
		redirections: [],
	};
}

function mustBeGrepStep(step: ReturnType<typeof compileGrep>): GrepStep {
	if (step.cmd !== 'grep') {
		throw new Error(`Expected grep step, received ${step.cmd}`);
	}
	return step;
}

test('compileGrep parses explicit pattern and file operands', () => {
	const step = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('-i'),
				literal('-n'),
				literal('-e'),
				literal('foo'),
				literal('/tmp/in.txt'),
			])
		)
	);

	expect(step.cmd).toBe('grep');
	expect(step.args.options.ignoreCase).toBe(true);
	expect(step.args.options.lineNumber).toBe(true);
	expect(step.args.explicitPatterns).toEqual([literal('foo')]);
	expect(step.args.fileOperands).toEqual([literal('/tmp/in.txt')]);
	expect(step.args.usageError).toBe(false);
});

test('compileGrep assigns implicit pattern when -e/-f are absent', () => {
	const step = mustBeGrepStep(
		compileGrep(grepCommand([literal('needle'), literal('a.txt')]))
	);

	expect(step.args.explicitPatterns).toEqual([literal('needle')]);
	expect(step.args.fileOperands).toEqual([literal('a.txt')]);
	expect(step.args.noPatternsYet).toBe(false);
});

test('compileGrep supports numeric shorthand context option', () => {
	const step = mustBeGrepStep(
		compileGrep(
			grepCommand([literal('-2'), literal('needle'), literal('a.txt')])
		)
	);

	expect(step.args.options.beforeContext).toBe(2);
	expect(step.args.options.afterContext).toBe(2);
	expect(step.args.usageError).toBe(false);
});

test('compileGrep records diagnostics for missing value options', () => {
	const step = mustBeGrepStep(compileGrep(grepCommand([literal('-e')])));

	expect(step.args.usageError).toBe(true);
	expect(step.args.noPatternsYet).toBe(true);
	expect(step.args.diagnostics).toEqual([
		expect.objectContaining({
			code: 'missing-value',
			location: expect.objectContaining({
				command: 'grep',
				token: '-e',
				tokenIndex: 0,
			}),
			message: 'Option -e requires a value.',
			phase: 'compile',
			severity: 'error',
		}),
	]);
});

test('compileGrep records diagnostics for unknown options', () => {
	const step = mustBeGrepStep(
		compileGrep(grepCommand([literal('--does-not-exist'), literal('foo')]))
	);

	expect(step.args.usageError).toBe(true);
	expect(step.args.diagnostics[0]).toMatchObject({
		code: 'unknown-option',
		location: expect.objectContaining({
			command: 'grep',
			token: '--does-not-exist',
			tokenIndex: 0,
		}),
		phase: 'compile',
	});
});
