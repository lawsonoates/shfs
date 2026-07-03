/**
 * tree command handler for the AST-based compiler.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	literal,
	type SimpleCommandIR,
	type StepIR,
	type TreeArgsIR,
} from '../../../ir';
import {
	createWordParserEffect,
	type FlagDef,
	type ParseWordsResult,
} from '../arg/parse';

const flags: Record<string, FlagDef> = {
	ascii: { short: 'A', takesValue: false },
	classify: { short: 'F', takesValue: false },
	dirsOnly: { short: 'd', takesValue: false },
	excludePattern: {
		short: 'I',
		takesValue: true,
		multiple: true,
		allowFlagLikeValue: true,
	},
	fullPath: { short: 'f', takesValue: false },
	includePattern: {
		short: 'P',
		takesValue: true,
		multiple: true,
		allowFlagLikeValue: true,
	},
	matchDirs: { long: 'matchdirs', takesValue: false },
	maxDepth: { short: 'L', takesValue: true },
	noReport: { long: 'noreport', takesValue: false },
	prune: { long: 'prune', takesValue: false },
	showAll: { short: 'a', takesValue: false },
};

type ParsedTreeWords = ParseWordsResult<ExpandedWord>;

const parseTreeArgs = createWordParserEffect<ExpandedWord>(
	flags,
	expandedWordToString
);

export function compileTree(command: SimpleCommandIR): StepIR {
	const result = compileTreeEffect(command);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileTreeEffect: (
	command: SimpleCommandIR
) => Result<StepIR, CompileError> = (command) =>
	Result.gen(function* () {
		const parsed = yield* Result.mapError(
			parseTreeArgs(command.args),
			(cause) =>
				new CompileError(
					createCommandDiagnostic(
						'tree',
						'invalid-option',
						cause.message
					)
				)
		);

		return Result.ok({
			cmd: 'tree',
			args: {
				ascii: parsed.flags.ascii === true,
				classify: parsed.flags.classify === true,
				dirsOnly: parsed.flags.dirsOnly === true,
				excludePatterns: collectExpandedValues(
					parsed,
					command.args,
					'excludePattern'
				),
				fullPath: parsed.flags.fullPath === true,
				includePatterns: collectExpandedValues(
					parsed,
					command.args,
					'includePattern'
				),
				matchDirs: parsed.flags.matchDirs === true,
				maxDepth: yield* parseMaxDepth(parsed.flags.maxDepth),
				noReport: parsed.flags.noReport === true,
				paths:
					parsed.positionalWords.length === 0
						? [literal('.')]
						: parsed.positionalWords,
				prune: parsed.flags.prune === true,
				showAll: parsed.flags.showAll === true,
			} satisfies TreeArgsIR,
		} as const satisfies StepIR);
	});

function parseMaxDepth(value: unknown): Result<number | null, CompileError> {
	return Result.gen(function* () {
		if (typeof value !== 'string') {
			return Result.ok(null);
		}
		const maxDepth = Number.parseInt(value, 10);
		if (!Number.isFinite(maxDepth) || maxDepth < 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'tree',
					'invalid-level',
					`tree: invalid level, '${value}'`
				)
			);
		}
		return Result.ok(maxDepth);
	});
}

function collectExpandedValues(
	parsed: ParsedTreeWords,
	argv: readonly ExpandedWord[],
	canonical: string
): ExpandedWord[] {
	const values: ExpandedWord[] = [];
	const rawValues = normalizeValueList(parsed.flags[canonical]);
	const valueIndices = parsed.consumedValueIndices[canonical] ?? [];
	const valueSources = parsed.consumedValueSources[canonical] ?? [];
	const count = Math.min(rawValues.length, valueIndices.length);
	for (let index = 0; index < count; index += 1) {
		const rawValue = rawValues[index];
		const valueIndex = valueIndices[index];
		const source = valueSources[index];
		if (rawValue === undefined || valueIndex === undefined) {
			continue;
		}
		if (source === 'arg') {
			values.push(argv[valueIndex] ?? literal(rawValue));
			continue;
		}
		values.push(literal(rawValue));
	}
	return values;
}

function normalizeValueList(value: unknown): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	return [];
}
