import {
	expandedWordToString,
	literal,
	type SimpleCommandIR,
	type StepIR,
	type XargsArgsIR,
} from '../../../ir';

const DEFAULT_COMMAND = [literal('echo')];
const NUL_DELIMITER = '\0';

export function compileXargs(command: SimpleCommandIR): StepIR {
	return {
		cmd: 'xargs',
		args: parseXargsArgs(command.args),
	} as const;
}

export function parseXargsArgs(argv: SimpleCommandIR['args']): XargsArgsIR {
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
		const parsed = parseOption(argv, index, token, args);
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
}

function parseOption(
	argv: SimpleCommandIR['args'],
	index: number,
	token: string,
	args: XargsArgsIR
): { matched: boolean; nextIndex: number } {
	if (token === '--') {
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '-0' || token === '--null') {
		args.delimiter = NUL_DELIMITER;
		args.eof = null;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '-r' || token === '--no-run-if-empty') {
		args.noRunIfEmpty = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '-n' || token.startsWith('-n')) {
		const value = optionValue(argv, index, token, '-n');
		args.maxArgs = parsePositiveInteger(value.value, '-n');
		return { matched: true, nextIndex: value.nextIndex };
	}
	if (token === '-L' || token.startsWith('-L')) {
		const value = optionValue(argv, index, token, '-L');
		args.maxLines = parsePositiveInteger(value.value, '-L');
		return { matched: true, nextIndex: value.nextIndex };
	}
	if (token === '-E' || token.startsWith('-E')) {
		const value = optionValue(argv, index, token, '-E');
		args.eof = value.value;
		return { matched: true, nextIndex: value.nextIndex };
	}
	if (token === '-I' || token.startsWith('-I')) {
		const value = optionValue(argv, index, token, '-I');
		args.replace = value.value;
		args.maxLines = 1;
		return { matched: true, nextIndex: value.nextIndex };
	}
	if (token === '-d' || token.startsWith('-d')) {
		const value = optionValue(argv, index, token, '-d');
		args.delimiter = decodeDelimiter(value.value);
		args.eof = null;
		return { matched: true, nextIndex: value.nextIndex };
	}

	return { matched: false, nextIndex: index };
}

function optionValue(
	argv: SimpleCommandIR['args'],
	index: number,
	token: string,
	option: string
): { nextIndex: number; value: string } {
	if (token.length > option.length) {
		return { nextIndex: index + 1, value: token.slice(option.length) };
	}

	const next = argv[index + 1];
	if (!next) {
		throw new Error(`xargs: option ${option} requires a value`);
	}
	return { nextIndex: index + 2, value: expandedWordToString(next) };
}

function parsePositiveInteger(value: string, option: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`xargs: invalid value for ${option}: ${value}`);
	}
	return parsed;
}

function decodeDelimiter(value: string): string {
	if (value === '\\0') {
		return NUL_DELIMITER;
	}
	return value.at(0) ?? '';
}
