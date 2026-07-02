/**
 * head command handler for the AST-based compiler.
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
const parseHeadArgs = createWordParserEffect<ExpandedWord>(
	flags,
	expandedWordToString
);

/**
 * Compile a head command from SimpleCommandIR to StepIR.
 */
export function compileHead(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileHeadEffect(cmd));
}

export const compileHeadEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.head')(
	function* (cmd) {
		const parsed = yield* parseHeadArgsEffect(cmd.args);

		const n = yield* parseHeadCount(parsed.flags.lines);
		const files = parsed.positionalWords;

		return {
			cmd: 'head',
			args: { files, n },
		} as const;
	}
);

function parseHeadCount(
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
					'head',
					'invalid-count',
					'Invalid head count'
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
				'head',
				'invalid-count',
				'Invalid head count'
			)
		);
	});
}

function parseHeadArgsEffect(
	args: readonly ExpandedWord[]
): Effect.Effect<ParseWordsResult<ExpandedWord>, CompileError> {
	return parseHeadArgs(args, {
		negativeNumberFlag: 'lines',
		negativeNumberPolicy: 'value',
	}).pipe(Effect.mapError(normalizeHeadParseError));
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
