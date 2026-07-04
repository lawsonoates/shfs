/**
 * tail command handler for the AST-based compiler.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import {
	createWordParserEffect,
	type FlagDef,
	type ParsedFlagValue,
	type ParseWordsResult,
} from '../arg/parse';

const DEFAULT_LINE_COUNT = 10;
const flags: Record<string, FlagDef> = {
	lines: { multiple: true, short: 'n', takesValue: true },
};
const parseTailArgs = createWordParserEffect<ExpandedWord>(
	flags,
	expandedWordToString
);

/**
 * Compile a tail command from SimpleCommandIR to StepIR.
 */
export function compileTail(cmd: SimpleCommandIR): StepIR {
	const result = compileTailEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileTailEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		const parsed = yield* parseTailArgsEffect(cmd.args);

		const n = yield* parseTailCount(parsed.flags.lines);
		const files = parsed.positionalWords;

		return Result.ok({
			cmd: 'tail',
			args: { files, n },
		} as const satisfies StepIR);
	});

function parseTailCount(
	value: ParsedFlagValue | undefined
): Result<number, CompileError> {
	return Result.gen(function* () {
		const lastValue = yield* getLastValueToken(value);
		if (lastValue === undefined) {
			return Result.ok(DEFAULT_LINE_COUNT);
		}

		const parsedValue = Number(lastValue);
		if (!Number.isFinite(parsedValue)) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'tail',
					'invalid-count',
					'Invalid tail count'
				)
			);
		}

		return Result.ok(parsedValue);
	});
}

function getLastValueToken(
	value: ParsedFlagValue | undefined
): Result<string | undefined, CompileError> {
	if (value === undefined) {
		return Result.ok(undefined);
	}
	if (typeof value === 'string') {
		return Result.ok(value);
	}
	if (Array.isArray(value)) {
		return Result.ok(value.at(-1));
	}
	return Result.err(
		new CompileError(
			createCommandDiagnostic(
				'tail',
				'invalid-count',
				'Invalid tail count'
			)
		)
	);
}

function parseTailArgsEffect(
	args: readonly ExpandedWord[]
): Result<ParseWordsResult<ExpandedWord>, CompileError> {
	return Result.mapError(
		parseTailArgs(args, {
			negativeNumberFlag: 'lines',
			negativeNumberPolicy: 'value',
		}),
		normalizeTailParseError
	);
}

function normalizeTailParseError(cause: {
	readonly code: string;
	readonly message: string;
}): CompileError {
	if (cause.code === 'missing-value') {
		return new CompileError(
			createCommandDiagnostic(
				'tail',
				'missing-count',
				'tail -n requires a number'
			)
		);
	}
	if (cause.code === 'unknown-flag') {
		return new CompileError(
			createCommandDiagnostic(
				'tail',
				'unknown-option',
				'Unknown tail option'
			)
		);
	}
	return new CompileError(
		createCommandDiagnostic('tail', 'invalid-option', cause.message)
	);
}
