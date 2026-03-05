import {
	type ExpandedWord,
	expandedWordToString,
	type GrepArgsIR,
	type GrepDiagnosticIR,
	type GrepOptionsIR,
	literal,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';

const CONTEXT_SHORT_VALUE_FLAGS = new Set(['A', 'B', 'C']);
const CONTEXT_SHORTHAND_REGEX = /^-[0-9]+$/;
const VALUE_SHORT_FLAGS = new Set(['A', 'B', 'C', 'D', 'e', 'f', 'm']);

const DEFAULT_OPTIONS: GrepOptionsIR = {
	afterContext: 0,
	beforeContext: 0,
	binaryWithoutMatch: false,
	byteOffset: false,
	countOnly: false,
	directories: 'read',
	excludeDir: [],
	excludeFiles: [],
	filenameMode: 'default',
	help: false,
	ignoreCase: false,
	includeFiles: [],
	invertMatch: false,
	lineNumber: false,
	lineRegexp: false,
	listFilesWithMatches: false,
	listFilesWithoutMatch: false,
	maxCount: null,
	mode: 'bre',
	noMessages: false,
	nullData: false,
	onlyMatching: false,
	quiet: false,
	recursive: false,
	textMode: false,
	version: false,
	wordRegexp: false,
};

/**
 * Compile a grep command from SimpleCommandIR to StepIR.
 *
 * grep parsing now happens in compiler so runtime can operate on structured args.
 */
export function compileGrep(cmd: SimpleCommandIR): StepIR {
	return {
		cmd: 'grep',
		args: parseGrepArgs(cmd.args),
	} as const;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: GNU grep option semantics are order-sensitive and intentionally centralized here.
export function parseGrepArgs(argv: ExpandedWord[]): GrepArgsIR {
	const options: GrepOptionsIR = {
		...DEFAULT_OPTIONS,
		excludeDir: [],
		excludeFiles: [],
		includeFiles: [],
	};
	const explicitPatterns: ExpandedWord[] = [];
	const patternFiles: ExpandedWord[] = [];
	const fileOperands: ExpandedWord[] = [];
	const diagnostics: GrepDiagnosticIR[] = [];
	let endOfOptions = false;
	let implicitPatternAssigned = false;

	for (let index = 0; index < argv.length; index += 1) {
		const word = argv[index];
		if (word === undefined) {
			continue;
		}
		const token = expandedWordToString(word);

		if (!endOfOptions && token === '--') {
			endOfOptions = true;
			continue;
		}

		if (!endOfOptions && token.startsWith('--') && token.length > 2) {
			const consumed = parseLongOption(
				token,
				index,
				argv[index + 1],
				options,
				explicitPatterns,
				patternFiles
			);
			diagnostics.push(...consumed.diagnostics);
			if (consumed.consumedNext) {
				index += 1;
			}
			continue;
		}

		if (!endOfOptions && token.startsWith('-') && token !== '-') {
			if (CONTEXT_SHORTHAND_REGEX.test(token)) {
				const contextAmount = parseNumericOption(token.slice(1));
				if (contextAmount === null) {
					diagnostics.push(
						makeDiagnostic(
							'invalid-value',
							token,
							index,
							`Invalid numeric option value in "${token}".`
						)
					);
				} else {
					options.beforeContext = contextAmount;
					options.afterContext = contextAmount;
				}
				continue;
			}

			const consumed = parseShortOptionCluster(
				token,
				index,
				argv[index + 1],
				options,
				explicitPatterns,
				patternFiles
			);
			diagnostics.push(...consumed.diagnostics);
			if (consumed.consumedNext) {
				index += 1;
			}
			if (consumed.handled) {
				continue;
			}
		}

		if (
			!implicitPatternAssigned &&
			explicitPatterns.length === 0 &&
			patternFiles.length === 0
		) {
			explicitPatterns.push(word);
			implicitPatternAssigned = true;
			continue;
		}
		fileOperands.push(word);
	}

	const noPatternsYet =
		explicitPatterns.length === 0 && patternFiles.length === 0;

	return {
		diagnostics,
		explicitPatterns,
		fileOperands,
		noPatternsYet,
		options,
		patternFiles,
		usageError: diagnostics.length > 0,
	};
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Option decoding table is intentionally exhaustive for GNU-compatible behavior.
function parseLongOption(
	token: string,
	tokenIndex: number,
	nextWord: ExpandedWord | undefined,
	options: GrepOptionsIR,
	explicitPatterns: ExpandedWord[],
	patternFiles: ExpandedWord[]
): { consumedNext: boolean; diagnostics: GrepDiagnosticIR[] } {
	const diagnostics: GrepDiagnosticIR[] = [];
	const [name, inlineValue] = splitLongOption(token);
	const takeValue = (
		required: boolean
	): { consumedNext: boolean; value: ExpandedWord | null } => {
		if (inlineValue !== null) {
			return { consumedNext: false, value: literal(inlineValue) };
		}
		if (nextWord === undefined) {
			if (required) {
				diagnostics.push(
					makeDiagnostic(
						'missing-value',
						token,
						tokenIndex,
						`Option ${name} requires a value.`
					)
				);
			}
			return { consumedNext: false, value: null };
		}
		return { consumedNext: true, value: nextWord };
	};

	switch (name) {
		case '--after-context': {
			const valueRef = takeValue(true);
			const parsed = parseNumericOption(
				valueRef.value === null
					? null
					: expandedWordToString(valueRef.value)
			);
			if (parsed === null) {
				diagnostics.push(
					makeDiagnostic(
						'invalid-value',
						token,
						tokenIndex,
						`Invalid numeric value for option ${name}.`
					)
				);
				return {
					consumedNext:
						inlineValue === null && valueRef.value !== null,
					diagnostics,
				};
			}
			options.afterContext = parsed;
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--before-context': {
			const valueRef = takeValue(true);
			const parsed = parseNumericOption(
				valueRef.value === null
					? null
					: expandedWordToString(valueRef.value)
			);
			if (parsed === null) {
				diagnostics.push(
					makeDiagnostic(
						'invalid-value',
						token,
						tokenIndex,
						`Invalid numeric value for option ${name}.`
					)
				);
				return {
					consumedNext:
						inlineValue === null && valueRef.value !== null,
					diagnostics,
				};
			}
			options.beforeContext = parsed;
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--context': {
			const valueRef = takeValue(true);
			const parsed = parseNumericOption(
				valueRef.value === null
					? null
					: expandedWordToString(valueRef.value)
			);
			if (parsed === null) {
				diagnostics.push(
					makeDiagnostic(
						'invalid-value',
						token,
						tokenIndex,
						`Invalid numeric value for option ${name}.`
					)
				);
				return {
					consumedNext:
						inlineValue === null && valueRef.value !== null,
					diagnostics,
				};
			}
			options.beforeContext = parsed;
			options.afterContext = parsed;
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--binary-file': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				options.binaryWithoutMatch =
					expandedWordToString(valueRef.value) === 'without-match';
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--directories': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				const value = expandedWordToString(valueRef.value);
				options.directories = value === 'skip' ? 'skip' : 'read';
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--devices': {
			const valueRef = takeValue(true);
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--exclude': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				options.excludeFiles.push(expandedWordToString(valueRef.value));
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--exclude-dir': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				options.excludeDir.push(expandedWordToString(valueRef.value));
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--include': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				options.includeFiles.push(expandedWordToString(valueRef.value));
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--max-count': {
			const valueRef = takeValue(true);
			const parsed = parseNumericOption(
				valueRef.value === null
					? null
					: expandedWordToString(valueRef.value)
			);
			if (parsed === null) {
				diagnostics.push(
					makeDiagnostic(
						'invalid-value',
						token,
						tokenIndex,
						`Invalid numeric value for option ${name}.`
					)
				);
				return {
					consumedNext:
						inlineValue === null && valueRef.value !== null,
					diagnostics,
				};
			}
			options.maxCount = parsed;
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--regexp': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				explicitPatterns.push(valueRef.value);
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--file': {
			const valueRef = takeValue(true);
			if (valueRef.value !== null) {
				patternFiles.push(valueRef.value);
			}
			return {
				consumedNext: inlineValue === null && valueRef.value !== null,
				diagnostics,
			};
		}
		case '--extended-regexp':
			options.mode = 'ere';
			return { consumedNext: false, diagnostics };
		case '--basic-regexp':
			options.mode = 'bre';
			return { consumedNext: false, diagnostics };
		case '--fixed-strings':
			options.mode = 'fixed';
			return { consumedNext: false, diagnostics };
		case '--perl-regexp':
			options.mode = 'pcre';
			return { consumedNext: false, diagnostics };
		case '--recursive':
		case '--dereference-recursive':
			options.recursive = true;
			return { consumedNext: false, diagnostics };
		case '--with-filename':
			options.filenameMode = 'always';
			return { consumedNext: false, diagnostics };
		case '--no-filename':
			options.filenameMode = 'never';
			return { consumedNext: false, diagnostics };
		case '--files-with-matches':
			options.listFilesWithMatches = true;
			options.listFilesWithoutMatch = false;
			return { consumedNext: false, diagnostics };
		case '--files-without-match':
			options.listFilesWithoutMatch = true;
			options.listFilesWithMatches = false;
			return { consumedNext: false, diagnostics };
		case '--line-number':
			options.lineNumber = true;
			return { consumedNext: false, diagnostics };
		case '--byte-offset':
			options.byteOffset = true;
			return { consumedNext: false, diagnostics };
		case '--quiet':
		case '--silent':
			options.quiet = true;
			return { consumedNext: false, diagnostics };
		case '--invert-match':
			options.invertMatch = true;
			return { consumedNext: false, diagnostics };
		case '--line-regexp':
			options.lineRegexp = true;
			return { consumedNext: false, diagnostics };
		case '--word-regexp':
			options.wordRegexp = true;
			return { consumedNext: false, diagnostics };
		case '--ignore-case':
			options.ignoreCase = true;
			return { consumedNext: false, diagnostics };
		case '--null-data':
			options.nullData = true;
			return { consumedNext: false, diagnostics };
		case '--count':
			options.countOnly = true;
			return { consumedNext: false, diagnostics };
		case '--only-matching':
			options.onlyMatching = true;
			return { consumedNext: false, diagnostics };
		case '--text':
			options.textMode = true;
			return { consumedNext: false, diagnostics };
		case '--no-messages':
			options.noMessages = true;
			return { consumedNext: false, diagnostics };
		case '--help':
			options.help = true;
			return { consumedNext: false, diagnostics };
		case '--version':
			options.version = true;
			return { consumedNext: false, diagnostics };
		default:
			diagnostics.push(
				makeDiagnostic(
					'unknown-option',
					token,
					tokenIndex,
					`Unknown grep option: ${name}`
				)
			);
			return { consumedNext: false, diagnostics };
	}
}

function splitLongOption(token: string): [string, string | null] {
	const equalsIndex = token.indexOf('=');
	if (equalsIndex === -1) {
		return [token, null];
	}
	return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Cluster parsing is intentionally explicit to preserve short-option edge cases.
function parseShortOptionCluster(
	token: string,
	tokenIndex: number,
	nextWord: ExpandedWord | undefined,
	options: GrepOptionsIR,
	explicitPatterns: ExpandedWord[],
	patternFiles: ExpandedWord[]
): {
	consumedNext: boolean;
	diagnostics: GrepDiagnosticIR[];
	handled: boolean;
} {
	const diagnostics: GrepDiagnosticIR[] = [];
	let consumedNext = false;
	const body = token.slice(1);
	if (body.length === 0) {
		return { consumedNext: false, diagnostics, handled: false };
	}

	for (let i = 0; i < body.length; i += 1) {
		const flag = body[i];
		if (flag === undefined) {
			continue;
		}

		if (VALUE_SHORT_FLAGS.has(flag)) {
			const inlineValue = body.slice(i + 1);
			const valueRef: ExpandedWord | null =
				inlineValue === '' ? (nextWord ?? null) : literal(inlineValue);
			if (valueRef === null) {
				diagnostics.push(
					makeDiagnostic(
						'missing-value',
						token,
						tokenIndex,
						`Option -${flag} requires a value.`
					)
				);
				return { consumedNext, diagnostics, handled: true };
			}
			if (inlineValue === '') {
				consumedNext = true;
			}
			if (flag === 'e') {
				explicitPatterns.push(valueRef);
				return { consumedNext, diagnostics, handled: true };
			}
			if (flag === 'f') {
				patternFiles.push(valueRef);
				return { consumedNext, diagnostics, handled: true };
			}
			if (flag === 'm') {
				const parsedValue = parseNumericOption(
					expandedWordToString(valueRef)
				);
				if (parsedValue === null) {
					diagnostics.push(
						makeDiagnostic(
							'invalid-value',
							token,
							tokenIndex,
							'Invalid value for -m. Expected a non-negative integer.'
						)
					);
					return { consumedNext, diagnostics, handled: true };
				}
				options.maxCount = parsedValue;
				return { consumedNext, diagnostics, handled: true };
			}
			if (flag === 'D') {
				return { consumedNext, diagnostics, handled: true };
			}
			if (CONTEXT_SHORT_VALUE_FLAGS.has(flag)) {
				const parsedValue = parseNumericOption(
					expandedWordToString(valueRef)
				);
				if (parsedValue === null) {
					diagnostics.push(
						makeDiagnostic(
							'invalid-value',
							token,
							tokenIndex,
							`Invalid value for -${flag}. Expected a non-negative integer.`
						)
					);
					return { consumedNext, diagnostics, handled: true };
				}
				if (flag === 'A') {
					options.afterContext = parsedValue;
				} else if (flag === 'B') {
					options.beforeContext = parsedValue;
				} else {
					options.beforeContext = parsedValue;
					options.afterContext = parsedValue;
				}
				return { consumedNext, diagnostics, handled: true };
			}
			diagnostics.push(
				makeDiagnostic(
					'unknown-option',
					token,
					tokenIndex,
					`Unknown grep option: -${flag}`
				)
			);
			return { consumedNext, diagnostics, handled: true };
		}

		switch (flag) {
			case 'E':
				options.mode = 'ere';
				break;
			case 'F':
				options.mode = 'fixed';
				break;
			case 'G':
				options.mode = 'bre';
				break;
			case 'P':
				options.mode = 'pcre';
				break;
			case 'r':
			case 'R':
				options.recursive = true;
				break;
			case 'H':
				options.filenameMode = 'always';
				break;
			case 'h':
				options.filenameMode = 'never';
				break;
			case 'i':
				options.ignoreCase = true;
				break;
			case 'L':
				options.listFilesWithoutMatch = true;
				options.listFilesWithMatches = false;
				break;
			case 'l':
				options.listFilesWithMatches = true;
				options.listFilesWithoutMatch = false;
				break;
			case 'n':
				options.lineNumber = true;
				break;
			case 'b':
				options.byteOffset = true;
				break;
			case 'q':
				options.quiet = true;
				break;
			case 's':
				options.noMessages = true;
				break;
			case 'v':
				options.invertMatch = true;
				break;
			case 'w':
				options.wordRegexp = true;
				break;
			case 'x':
				options.lineRegexp = true;
				break;
			case 'o':
				options.onlyMatching = true;
				break;
			case 'c':
				options.countOnly = true;
				break;
			case 'z':
				options.nullData = true;
				break;
			case 'a':
				options.textMode = true;
				break;
			default:
				diagnostics.push(
					makeDiagnostic(
						'unknown-option',
						token,
						tokenIndex,
						`Unknown grep option: -${flag}`
					)
				);
				return { consumedNext, diagnostics, handled: true };
		}
	}

	return { consumedNext, diagnostics, handled: true };
}

function parseNumericOption(value: string | null): number | null {
	if (value === null || value === '') {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

function makeDiagnostic(
	code: GrepDiagnosticIR['code'],
	token: string,
	tokenIndex: number,
	message: string
): GrepDiagnosticIR {
	return {
		code,
		message,
		token,
		tokenIndex,
	};
}
