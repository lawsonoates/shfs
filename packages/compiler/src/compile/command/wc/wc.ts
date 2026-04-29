import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
	type WcArgsIR,
	type WcTotalMode,
} from '../../../ir';

const DEFAULT_TOTAL_MODE: WcTotalMode = 'auto';

export function compileWc(command: SimpleCommandIR): StepIR {
	return {
		cmd: 'wc',
		args: parseWcArgs(command.args),
	} as const;
}

function parseWcArgs(argv: readonly ExpandedWord[]): WcArgsIR {
	const args: WcArgsIR = {
		bytes: false,
		chars: false,
		files: [],
		files0From: null,
		lines: false,
		maxLineLength: false,
		total: DEFAULT_TOTAL_MODE,
		words: false,
	};

	for (let index = 0; index < argv.length; index++) {
		const word = argv[index];
		if (!word) {
			continue;
		}
		const token = expandedWordToString(word);
		if (token === '--') {
			args.files.push(...argv.slice(index + 1));
			break;
		}
		if (!token.startsWith('-') || token === '-') {
			args.files.push(word);
			continue;
		}

		const parsed = parseLongOption(argv, index, token, args);
		if (parsed.matched) {
			index = parsed.nextIndex - 1;
			continue;
		}
		parseShortOptions(token, args);
	}

	return args;
}

function parseLongOption(
	argv: readonly ExpandedWord[],
	index: number,
	token: string,
	args: WcArgsIR
): { matched: boolean; nextIndex: number } {
	if (token === '--bytes') {
		args.bytes = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--chars') {
		args.chars = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--lines') {
		args.lines = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--words') {
		args.words = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--max-line-length') {
		args.maxLineLength = true;
		return { matched: true, nextIndex: index + 1 };
	}
	if (token.startsWith('--files0-from=')) {
		args.files0From = {
			kind: 'literal',
			value: token.slice('--files0-from='.length),
		};
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--files0-from') {
		const value = argv[index + 1];
		if (!value) {
			throw new Error('wc: option --files0-from requires an argument');
		}
		args.files0From = value;
		return { matched: true, nextIndex: index + 2 };
	}
	if (token.startsWith('--total=')) {
		args.total = parseTotalMode(token.slice('--total='.length));
		return { matched: true, nextIndex: index + 1 };
	}
	if (token === '--total') {
		args.total = 'invalid';
		return { matched: true, nextIndex: index + 1 };
	}
	return { matched: false, nextIndex: index };
}

function parseShortOptions(token: string, args: WcArgsIR): void {
	for (const option of token.slice(1)) {
		switch (option) {
			case 'c':
				args.bytes = true;
				break;
			case 'm':
				args.chars = true;
				break;
			case 'l':
				args.lines = true;
				break;
			case 'w':
				args.words = true;
				break;
			case 'L':
				args.maxLineLength = true;
				break;
			default:
				throw new Error(`wc: unknown option -- ${option}`);
		}
	}
}

function parseTotalMode(value: string): WcTotalMode {
	if (
		value === 'auto' ||
		value === 'always' ||
		value === 'never' ||
		value === 'only'
	) {
		return value;
	}
	throw new Error(`wc: invalid --total value: ${value}`);
}
