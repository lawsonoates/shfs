/**
 * tail command handler for the AST-based compiler.
 */

import { Effect } from 'effect';
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
	return Effect.runSync(compileTailEffect(cmd));
}

export const compileTailEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.tail')(
	function* (cmd) {
		const parsed = yield* parseTailArgsEffect(cmd.args);

		const n = yield* parseTailCount(parsed.flags.lines);
		const files = parsed.positionalWords;

		return {
			cmd: 'tail',
			args: { files, n },
		} as const;
	}
);

function parseTailCount(
	value: ParsedFlagValue | undefined
): Effect.Effect<number, CompileError> {
	return Effect.gen(function* () {
		const lastValue = yield* getLastValueToken(value);
		if (lastValue === undefined) {
			return DEFAULT_LINE_COUNT;
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

		return parsedValue;
	});
}

function getLastValueToken(
	value: ParsedFlagValue | undefined
): Effect.Effect<string | undefined, CompileError> {
	return Effect.gen(function* () {
		if (value === undefined) {
			return undefined;
		}
		if (typeof value === 'string') {
			return value;
		}
		if (Array.isArray(value)) {
			const lastValue = value.at(-1);
			return lastValue;
		}
		return yield* new CompileError(
			createCommandDiagnostic(
				'tail',
				'invalid-count',
				'Invalid tail count'
			)
		);
	});
}

function parseTailArgsEffect(
	args: readonly ExpandedWord[]
): Effect.Effect<ParseWordsResult<ExpandedWord>, CompileError> {
	return parseTailArgs(args, {
		negativeNumberFlag: 'lines',
		negativeNumberPolicy: 'value',
	}).pipe(Effect.mapError(normalizeTailParseError));
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
