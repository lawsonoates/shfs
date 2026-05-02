/**
 * tree command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	expandedWordToString,
	literal,
	type SimpleCommandIR,
	type StepIR,
	type TreeArgsIR,
} from '../../../ir';
import {
	createWordParser,
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

const parseTreeArgs = createWordParser<ExpandedWord>(
	flags,
	expandedWordToString
);

export function compileTree(command: SimpleCommandIR): StepIR {
	const parsed = parseTreeArgs(command.args);

	return {
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
			maxDepth: parseMaxDepth(parsed.flags.maxDepth),
			noReport: parsed.flags.noReport === true,
			paths:
				parsed.positionalWords.length === 0
					? [literal('.')]
					: parsed.positionalWords,
			prune: parsed.flags.prune === true,
			showAll: parsed.flags.showAll === true,
		} satisfies TreeArgsIR,
	} as const;
}

function parseMaxDepth(value: unknown): number | null {
	if (typeof value !== 'string') {
		return null;
	}
	const maxDepth = Number.parseInt(value, 10);
	if (!Number.isFinite(maxDepth) || maxDepth < 0) {
		throw new Error(`tree: invalid level, '${value}'`);
	}
	return maxDepth;
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
