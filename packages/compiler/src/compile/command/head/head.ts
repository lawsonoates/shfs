/**
 * head command handler for the AST-based compiler.
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
const parseHeadArgs = createWordParserEffect<ExpandedWord>(
	flags,
	expandedWordToString
);

/**
 * Compile a head command from SimpleCommandIR to StepIR.
 */
export function compileHead(cmd: SimpleCommandIR): StepIR {
	const result = compileHeadEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileHeadEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		const parsed = yield* parseHeadArgsEffect(cmd.args);

		const n = yield* parseHeadCount(parsed.flags.lines);
		const files = parsed.positionalWords;

		return Result.ok({
			cmd: 'head',
			args: { files, n },
		} as const satisfies StepIR);
	});

function parseHeadCount(
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
					'head',
					'invalid-count',
					'Invalid head count'
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
				'head',
				'invalid-count',
				'Invalid head count'
			)
		)
	);
}

function parseHeadArgsEffect(
	args: readonly ExpandedWord[]
): Result<ParseWordsResult<ExpandedWord>, CompileError> {
	return Result.mapError(
		parseHeadArgs(args, {
			negativeNumberFlag: 'lines',
			negativeNumberPolicy: 'value',
		}),
		normalizeHeadParseError
	);
}

function normalizeHeadParseError(cause: {
	readonly code: string;
	readonly message: string;
}): CompileError {
	if (cause.code === 'missing-value') {
		return new CompileError(
			createCommandDiagnostic(
				'head',
				'missing-count',
				'head -n requires a number'
			)
		);
	}
	if (cause.code === 'unknown-flag') {
		return new CompileError(
			createCommandDiagnostic(
				'head',
				'unknown-option',
				'Unknown head option'
			)
		);
	}
	return new CompileError(
		createCommandDiagnostic('head', 'invalid-option', cause.message)
	);
}
