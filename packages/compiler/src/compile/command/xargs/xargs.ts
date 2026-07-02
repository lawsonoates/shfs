import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	expandedWordToString,
	literal,
	type SimpleCommandIR,
	type StepIR,
	type XargsArgsIR,
} from '../../../ir';

const DEFAULT_COMMAND = [literal('echo')];
const NUL_DELIMITER = '\0';
const VALUE_OPTIONS = ['-n', '-L', '-E', '-I', '-d'] as const;

type ValueOption = (typeof VALUE_OPTIONS)[number];

export function compileXargs(command: SimpleCommandIR): StepIR {
	return Effect.runSync(compileXargsEffect(command));
}

export const compileXargsEffect: (
	command: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.xargs')(
	function* (command) {
		return {
			cmd: 'xargs',
			args: yield* parseXargsArgsEffect(command.args),
		} as const;
	}
);

export function parseXargsArgs(argv: SimpleCommandIR['args']): XargsArgsIR {
	return Effect.runSync(parseXargsArgsEffect(argv));
}

export const parseXargsArgsEffect: (
	argv: SimpleCommandIR['args']
) => Effect.Effect<XargsArgsIR, CompileError> = Effect.fn(
	'Compiler.xargs.parseArgs'
)(function* (argv) {
	const args: XargsArgsIR = {
		command: DEFAULT_COMMAND,
		delimiter: null,
		eof: null,
		maxArgs: null,
		maxLines: null,
		noRunIfEmpty: false,
		replace: null,
	};

	let index = 0;
	while (index < argv.length) {
		const word = argv[index];
		if (!word) {
			break;
		}
		const token = expandedWordToString(word);
		const parsed = yield* parseOption(argv, index, token, args);
		if (!parsed.matched) {
			break;
		}
		index = parsed.nextIndex;
	}

	const commandWords = argv.slice(index);
	if (commandWords.length > 0) {
		args.command = commandWords;
	}
	return args;
});

function parseOption(
	argv: SimpleCommandIR['args'],
	index: number,
	token: string,
	args: XargsArgsIR
): Effect.Effect<{ matched: boolean; nextIndex: number }, CompileError> {
	return Effect.gen(function* () {
		if (token === '--') {
			return { matched: true, nextIndex: index + 1 };
		}
		if (applySimpleOption(args, token)) {
			return { matched: true, nextIndex: index + 1 };
		}

		const valueOption = getValueOption(token);
		if (valueOption) {
			const value = yield* optionValue(argv, index, token, valueOption);
			yield* applyValueOption(args, valueOption, value.value);
			return { matched: true, nextIndex: value.nextIndex };
		}

		return { matched: false, nextIndex: index };
	});
}

function applySimpleOption(args: XargsArgsIR, token: string): boolean {
	if (token === '-0' || token === '--null') {
		args.delimiter = NUL_DELIMITER;
		args.eof = null;
		return true;
	}
	if (token === '-r' || token === '--no-run-if-empty') {
		args.noRunIfEmpty = true;
		return true;
	}
	return false;
}

function getValueOption(token: string): ValueOption | null {
	for (const option of VALUE_OPTIONS) {
		if (token === option || token.startsWith(option)) {
			return option;
		}
	}
	return null;
}

function applyValueOption(
	args: XargsArgsIR,
	option: ValueOption,
	value: string
): Effect.Effect<void, CompileError> {
	return Effect.gen(function* () {
		switch (option) {
			case '-n':
				setMaxArgsMode(
					args,
					yield* parsePositiveInteger(value, option)
				);
				return;
			case '-L':
				setMaxLinesMode(
					args,
					yield* parsePositiveInteger(value, option)
				);
				return;
			case '-E':
				args.eof = value;
				return;
			case '-I':
				setReplaceMode(args, value);
				return;
			case '-d':
				args.delimiter = decodeDelimiter(value);
				args.eof = null;
				return;
			default: {
				const _exhaustive: never = option;
				return _exhaustive;
			}
		}
	});
}

function setMaxArgsMode(args: XargsArgsIR, maxArgs: number): void {
	args.maxArgs = maxArgs;
	args.maxLines = null;
	args.replace = null;
}

function setMaxLinesMode(args: XargsArgsIR, maxLines: number): void {
	args.maxLines = maxLines;
	args.maxArgs = null;
	args.replace = null;
}

function setReplaceMode(args: XargsArgsIR, replace: string): void {
	args.replace = replace;
	args.maxLines = 1;
	args.maxArgs = null;
}

function optionValue(
	argv: SimpleCommandIR['args'],
	index: number,
	token: string,
	option: string
): Effect.Effect<{ nextIndex: number; value: string }, CompileError> {
	return Effect.gen(function* () {
		if (token.length > option.length) {
			return { nextIndex: index + 1, value: token.slice(option.length) };
		}

		const next = argv[index + 1];
		if (!next) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'xargs',
					'missing-option-value',
					`xargs: option ${option} requires a value`
				)
			);
		}
		return { nextIndex: index + 2, value: expandedWordToString(next) };
	});
}

function parsePositiveInteger(
	value: string,
	option: string
): Effect.Effect<number, CompileError> {
	return Effect.gen(function* () {
		const parsed = Number.parseInt(value, 10);
		if (!Number.isInteger(parsed) || parsed < 1) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'xargs',
					'invalid-option-value',
					`xargs: invalid value for ${option}: ${value}`
				)
			);
		}
		return parsed;
	});
}

function decodeDelimiter(value: string): string {
	if (value === '\\0') {
		return NUL_DELIMITER;
	}
	return value.at(0) ?? '';
}
