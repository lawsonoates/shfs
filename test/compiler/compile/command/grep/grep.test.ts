import { expect, test } from 'bun:test';
import { compileGrep } from '#compiler/compile/command/grep/grep';
import {
	type ExpandedWord,
	type GrepStep,
	literal,
	type SimpleCommandIR,
} from '#compiler/ir';

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

test('compileGrep maps --binary-files=without-match to binary suppression mode', () => {
	const step = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('--binary-files=without-match'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);

	expect(step.args.usageError).toBe(false);
	expect(step.args.options.binaryWithoutMatch).toBe(true);
	expect(step.args.options.textMode).toBe(false);
});

test('compileGrep maps --binary-files=text and -a to text mode', () => {
	const longForm = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('--binary-files=text'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);
	const shortForm = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('-a'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);

	expect(longForm.args.usageError).toBe(false);
	expect(longForm.args.options.textMode).toBe(true);
	expect(longForm.args.options.binaryWithoutMatch).toBe(false);

	expect(shortForm.args.usageError).toBe(false);
	expect(shortForm.args.options.textMode).toBe(true);
	expect(shortForm.args.options.binaryWithoutMatch).toBe(false);
});

test('compileGrep maps -I to binary without-match mode', () => {
	const step = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('-I'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);

	expect(step.args.usageError).toBe(false);
	expect(step.args.options.binaryWithoutMatch).toBe(true);
	expect(step.args.options.textMode).toBe(false);
});

test('compileGrep applies last binary-related flag when mixing --binary-files and -a', () => {
	const textWins = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('--binary-files=binary'),
				literal('-a'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);
	const withoutMatchWins = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('-a'),
				literal('-I'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);

	expect(textWins.args.usageError).toBe(false);
	expect(textWins.args.options.binaryWithoutMatch).toBe(false);
	expect(textWins.args.options.textMode).toBe(true);

	expect(withoutMatchWins.args.usageError).toBe(false);
	expect(withoutMatchWins.args.options.binaryWithoutMatch).toBe(true);
	expect(withoutMatchWins.args.options.textMode).toBe(false);
});

test('compileGrep reports invalid --binary-files value', () => {
	const step = mustBeGrepStep(
		compileGrep(
			grepCommand([
				literal('--binary-files=not-a-mode'),
				literal('needle'),
				literal('/tmp/in.bin'),
			])
		)
	);

	expect(step.args.usageError).toBe(true);
	expect(step.args.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'invalid-value',
				location: expect.objectContaining({
					command: 'grep',
					token: '--binary-files=not-a-mode',
				}),
			}),
		])
	);
});
