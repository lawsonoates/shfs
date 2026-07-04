import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
	type WcArgsIR,
	type WcTotalMode,
} from '../../../ir';

const DEFAULT_TOTAL_MODE: WcTotalMode = 'auto';
const LONG_BOOLEAN_OPTIONS = new Map<string, (args: WcArgsIR) => void>([
	[
		'--bytes',
		(args) => {
			args.bytes = true;
		},
	],
	[
		'--chars',
		(args) => {
			args.chars = true;
		},
	],
	[
		'--lines',
		(args) => {
			args.lines = true;
		},
	],
	[
		'--words',
		(args) => {
			args.words = true;
		},
	],
	[
		'--max-line-length',
		(args) => {
			args.maxLineLength = true;
		},
	],
]);

export function compileWc(command: SimpleCommandIR): StepIR {
	const result = compileWcEffect(command);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileWcEffect: (
	command: SimpleCommandIR
) => Result<StepIR, CompileError> = (command) =>
	Result.gen(function* () {
		return Result.ok({
			cmd: 'wc',
			args: yield* parseWcArgs(command.args),
		} as const satisfies StepIR);
	});

function parseWcArgs(
	argv: readonly ExpandedWord[]
): Result<WcArgsIR, CompileError> {
	return Result.gen(function* () {
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

			const parsed = yield* parseLongOption(argv, index, token, args);
			if (parsed.matched) {
				index = parsed.nextIndex - 1;
				continue;
			}
			yield* parseShortOptions(token, args);
		}

		return Result.ok(args);
	});
}

function parseLongOption(
	argv: readonly ExpandedWord[],
	index: number,
	token: string,
	args: WcArgsIR
): Result<{ matched: boolean; nextIndex: number }, CompileError> {
	return Result.gen(function* () {
		const applyBooleanOption = LONG_BOOLEAN_OPTIONS.get(token);
		if (applyBooleanOption) {
			applyBooleanOption(args);
			return Result.ok({ matched: true, nextIndex: index + 1 });
		}
		if (token.startsWith('--files0-from=')) {
			args.files0From = {
				kind: 'literal',
				value: token.slice('--files0-from='.length),
			};
			return Result.ok({ matched: true, nextIndex: index + 1 });
		}
		if (token === '--files0-from') {
			const value = argv[index + 1];
			if (!value) {
				return yield* new CompileError(
					createCommandDiagnostic(
						'wc',
						'missing-files0-from',
						'wc: option --files0-from requires an argument'
					)
				);
			}
			args.files0From = value;
			return Result.ok({ matched: true, nextIndex: index + 2 });
		}
		if (token.startsWith('--total=')) {
			args.total = yield* parseTotalMode(token.slice('--total='.length));
			return Result.ok({ matched: true, nextIndex: index + 1 });
		}
		if (token === '--total') {
			args.total = 'invalid';
			return Result.ok({ matched: true, nextIndex: index + 1 });
		}
		return Result.ok({ matched: false, nextIndex: index });
	});
}

function parseShortOptions(
	token: string,
	args: WcArgsIR
): Result<void, CompileError> {
	return Result.gen(function* () {
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
					return yield* new CompileError(
						createCommandDiagnostic(
							'wc',
							'unknown-option',
							`wc: unknown option -- ${option}`
						)
					);
			}
		}
		return Result.ok();
	});
}

function parseTotalMode(value: string): Result<WcTotalMode, CompileError> {
	return Result.gen(function* () {
		if (
			value === 'auto' ||
			value === 'always' ||
			value === 'never' ||
			value === 'only'
		) {
			const totalMode: WcTotalMode = value;
			return Result.ok(totalMode);
		}
		return yield* new CompileError(
			createCommandDiagnostic(
				'wc',
				'invalid-total',
				`wc: invalid --total value: ${value}`
			)
		);
	});
}
