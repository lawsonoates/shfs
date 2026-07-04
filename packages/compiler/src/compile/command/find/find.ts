import { createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type FindActionIR,
	type FindArgsIR,
	type FindDiagnosticIR,
	type FindPredicateIR,
	type FindTraversalIR,
	type FindTypeIR,
	literal,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';

type FindDiagnosticCode =
	| 'invalid-value'
	| 'invalid-expression'
	| 'missing-value'
	| 'unexpected-operand'
	| 'unknown-predicate';

const DEFAULT_ACTION: FindActionIR = {
	explicit: false,
	kind: 'print',
};

const DEFAULT_TRAVERSAL: FindTraversalIR = {
	depth: false,
	maxdepth: null,
	mindepth: 0,
	symlinkMode: 'physical',
};

const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;

interface FindParseState {
	action: FindActionIR;
	currentBranch: FindPredicateIR[];
	currentSideAllowsEmptyBranch: boolean;
	diagnostics: FindDiagnosticIR[];
	lastOrTokenIndex: number | null;
	predicateBranches: FindPredicateIR[][];
	sawOr: boolean;
	traversal: FindTraversalIR;
}

type FindPatternPredicateToken =
	| '-name'
	| '-iname'
	| '-path'
	| '-ipath'
	| '-wholename'
	| '-iwholename'
	| '-regex'
	| '-iregex';

const PATTERN_PREDICATES = new Set<FindPatternPredicateToken>([
	'-name',
	'-iname',
	'-path',
	'-ipath',
	'-wholename',
	'-iwholename',
	'-regex',
	'-iregex',
]);

export function compileFind(command: SimpleCommandIR): StepIR {
	return {
		cmd: 'find',
		args: parseFindArgs(command.args),
	} as const;
}

export function parseFindArgs(argv: ExpandedWord[]): FindArgsIR {
	const state: FindParseState = {
		action: { ...DEFAULT_ACTION },
		currentBranch: [],
		currentSideAllowsEmptyBranch: false,
		diagnostics: [],
		lastOrTokenIndex: null,
		predicateBranches: [],
		sawOr: false,
		traversal: { ...DEFAULT_TRAVERSAL },
	};
	const startPathStartIndex = parseLeadingOptions(argv, state);
	const predicateStartIndex = findPredicateStartIndex(
		argv,
		startPathStartIndex
	);
	const explicitStartPaths = argv.slice(
		startPathStartIndex,
		predicateStartIndex
	);
	const startPaths =
		explicitStartPaths.length > 0 ? explicitStartPaths : [literal('.')];

	let index = predicateStartIndex;
	while (index < argv.length) {
		const word = argv[index];
		if (!word) {
			break;
		}
		index = parseFindToken(argv, index, expandedWordToString(word), state);
	}

	return {
		action: state.action,
		diagnostics: state.diagnostics,
		predicateBranches: finalizePredicateBranches(state),
		startPaths,
		traversal: state.traversal,
		usageError: state.diagnostics.length > 0,
	};
}

function createDiagnostic(
	code: FindDiagnosticCode,
	token: string,
	tokenIndex: number,
	message: string
): FindDiagnosticIR {
	return createCommandDiagnostic('find', code, message, {
		token,
		tokenIndex,
	});
}

function createMissingValueDiagnostic(
	token: string,
	tokenIndex: number
): FindDiagnosticIR {
	return createDiagnostic(
		'missing-value',
		token,
		tokenIndex,
		`find: missing argument to ${token}`
	);
}

function createMissingExpressionDiagnostic(
	side: 'left' | 'right',
	tokenIndex: number
): FindDiagnosticIR {
	return createDiagnostic(
		'invalid-expression',
		'-o',
		tokenIndex,
		`find: -o is missing a ${side} predicate expression`
	);
}

function parseLeadingOptions(
	argv: ExpandedWord[],
	state: FindParseState
): number {
	let index = 0;
	while (index < argv.length) {
		const word = argv[index];
		if (!word) {
			break;
		}
		const token = expandedWordToString(word);
		if (!parseSymlinkModeOption(token, state)) {
			break;
		}
		index += 1;
	}
	return index;
}

function parseSymlinkModeOption(token: string, state: FindParseState): boolean {
	if (token === '-H') {
		state.traversal.symlinkMode = 'command-line';
		return true;
	}
	if (token === '-L') {
		state.traversal.symlinkMode = 'logical';
		return true;
	}
	if (token === '-P') {
		state.traversal.symlinkMode = 'physical';
		return true;
	}
	return false;
}

function findPredicateStartIndex(
	argv: ExpandedWord[],
	startIndex: number
): number {
	for (let index = startIndex; index < argv.length; index += 1) {
		const word = argv[index];
		if (!word) {
			continue;
		}
		if (expandedWordToString(word).startsWith('-')) {
			return index;
		}
	}
	return argv.length;
}

function parseFindToken(
	argv: ExpandedWord[],
	index: number,
	token: string,
	state: FindParseState
): number {
	if (isPatternPredicateToken(token)) {
		return parsePatternPredicate(argv, index, token, state);
	}
	if (token === '-type') {
		return parseTypePredicate(argv, index, '-type', state);
	}
	if (token === '-xtype') {
		return parseTypePredicate(argv, index, '-xtype', state);
	}
	if (parseSymlinkModeOption(token, state)) {
		state.currentSideAllowsEmptyBranch = true;
		return index + 1;
	}
	if (token === '-true' || token === '-false') {
		state.currentBranch.push({
			kind: 'constant',
			value: token === '-true',
		});
		return index + 1;
	}
	if (token === '-empty') {
		state.currentBranch.push({
			kind: 'empty',
		});
		return index + 1;
	}
	if (token === '-o' || token === '-or') {
		return parseOrPredicateSeparator(index, state);
	}
	if (token === '-maxdepth' || token === '-mindepth') {
		return parseTraversalOption(argv, index, token, state);
	}
	if (token === '-depth') {
		state.traversal.depth = true;
		state.currentSideAllowsEmptyBranch = true;
		return index + 1;
	}
	if (token === '-print') {
		state.action.explicit = true;
		state.currentSideAllowsEmptyBranch = true;
		return index + 1;
	}
	if (token.startsWith('-')) {
		state.diagnostics.push(
			createDiagnostic(
				'unknown-predicate',
				token,
				index,
				`find: unknown predicate: ${token}`
			)
		);
		return index + 1;
	}

	state.diagnostics.push(
		createDiagnostic(
			'unexpected-operand',
			token,
			index,
			`find: unexpected argument: ${token}`
		)
	);
	return index + 1;
}

function isPatternPredicateToken(
	token: string
): token is FindPatternPredicateToken {
	return PATTERN_PREDICATES.has(token as FindPatternPredicateToken);
}

function parseOrPredicateSeparator(
	index: number,
	state: FindParseState
): number {
	state.sawOr = true;
	state.lastOrTokenIndex = index;

	if (
		state.currentBranch.length === 0 &&
		!state.currentSideAllowsEmptyBranch
	) {
		state.diagnostics.push(
			createMissingExpressionDiagnostic('left', index)
		);
		return index + 1;
	}

	state.predicateBranches.push(state.currentBranch);
	state.currentBranch = [];
	state.currentSideAllowsEmptyBranch = false;
	return index + 1;
}

function parsePatternPredicate(
	argv: ExpandedWord[],
	index: number,
	token: FindPatternPredicateToken,
	state: FindParseState
): number {
	const valueWord = argv[index + 1];
	if (!valueWord) {
		state.diagnostics.push(createMissingValueDiagnostic(token, index));
		return index + 1;
	}

	switch (token) {
		case '-name': {
			state.currentBranch.push({
				kind: 'name',
				pattern: valueWord,
			});
			break;
		}
		case '-iname': {
			state.currentBranch.push({
				kind: 'iname',
				pattern: valueWord,
			});
			break;
		}
		case '-path':
		case '-wholename': {
			state.currentBranch.push({
				kind: 'path',
				pattern: valueWord,
			});
			break;
		}
		case '-ipath':
		case '-iwholename': {
			state.currentBranch.push({
				kind: 'ipath',
				pattern: valueWord,
			});
			break;
		}
		case '-regex':
		case '-iregex': {
			state.currentBranch.push({
				kind: 'regex',
				caseInsensitive: token === '-iregex',
				pattern: valueWord,
			});
			break;
		}
		default: {
			const _never: never = token;
			return _never;
		}
	}
	return index + 2;
}

function parseTypePredicate(
	argv: ExpandedWord[],
	index: number,
	token: '-type' | '-xtype',
	state: FindParseState
): number {
	const valueWord = argv[index + 1];
	if (!valueWord) {
		state.diagnostics.push(createMissingValueDiagnostic(token, index));
		return index + 1;
	}

	const parsedType = parseFindTypeValue(token, valueWord, index + 1);
	if ('diagnostic' in parsedType) {
		state.diagnostics.push(parsedType.diagnostic);
	} else {
		state.currentBranch.push({
			kind: token === '-type' ? 'type' : 'xtype',
			types: parsedType.types,
		});
	}
	return index + 2;
}

function finalizePredicateBranches(state: FindParseState): FindPredicateIR[][] {
	if (state.currentBranch.length > 0) {
		state.predicateBranches.push(state.currentBranch);
	} else if (state.sawOr && state.lastOrTokenIndex !== null) {
		if (state.currentSideAllowsEmptyBranch) {
			state.predicateBranches.push(state.currentBranch);
			return state.predicateBranches;
		}
		state.diagnostics.push(
			createMissingExpressionDiagnostic('right', state.lastOrTokenIndex)
		);
	}
	return state.predicateBranches;
}

function parseTraversalOption(
	argv: ExpandedWord[],
	index: number,
	token: '-maxdepth' | '-mindepth',
	state: FindParseState
): number {
	const valueWord = argv[index + 1];
	if (!valueWord) {
		state.diagnostics.push(createMissingValueDiagnostic(token, index));
		return index + 1;
	}

	const parsedNumericValue = parseNonNegativeInteger(
		token,
		valueWord,
		index + 1
	);
	if ('diagnostic' in parsedNumericValue) {
		state.diagnostics.push(parsedNumericValue.diagnostic);
		return index + 2;
	}

	if (token === '-maxdepth') {
		state.traversal.maxdepth = parsedNumericValue.value;
	} else {
		state.traversal.mindepth = parsedNumericValue.value;
	}
	state.currentSideAllowsEmptyBranch = true;
	return index + 2;
}

function parseFindTypeValue(
	token: '-type' | '-xtype',
	word: ExpandedWord,
	tokenIndex: number
): { diagnostic: FindDiagnosticIR } | { types: FindTypeIR[] } {
	const rawValue = expandedWordToString(word);
	if (rawValue === '') {
		return {
			diagnostic: createDiagnostic(
				'invalid-value',
				rawValue,
				tokenIndex,
				`find: Arguments to ${token} should contain at least one letter`
			),
		};
	}
	if (rawValue.endsWith(',')) {
		return {
			diagnostic: createDiagnostic(
				'invalid-value',
				rawValue,
				tokenIndex,
				`find: Last file type in list argument to ${token} is missing`
			),
		};
	}

	const parts = rawValue.split(',');
	if (parts.some((part) => part === '')) {
		return {
			diagnostic: createDiagnostic(
				'invalid-value',
				rawValue,
				tokenIndex,
				`find: File type in list argument to ${token} is missing`
			),
		};
	}

	const seen = new Set<FindTypeIR>();
	const types: FindTypeIR[] = [];
	for (const part of parts) {
		if (part.length > 1) {
			return {
				diagnostic: createDiagnostic(
					'invalid-value',
					rawValue,
					tokenIndex,
					'find: Must separate multiple arguments to -type with commas'
				),
			};
		}
		if (part !== 'd' && part !== 'f' && part !== 'l') {
			return {
				diagnostic: createDiagnostic(
					'invalid-value',
					rawValue,
					tokenIndex,
					`find: Unknown argument to ${token}: ${part}`
				),
			};
		}
		if (seen.has(part)) {
			return {
				diagnostic: createDiagnostic(
					'invalid-value',
					rawValue,
					tokenIndex,
					`find: Duplicate file type in list argument to ${token}: ${part}`
				),
			};
		}
		seen.add(part);
		types.push(part);
	}

	return { types };
}

function parseNonNegativeInteger(
	token: string,
	word: ExpandedWord,
	tokenIndex: number
): { diagnostic: FindDiagnosticIR } | { value: number } {
	const rawValue = expandedWordToString(word);
	if (!NON_NEGATIVE_INTEGER_REGEX.test(rawValue)) {
		return {
			diagnostic: createDiagnostic(
				'invalid-value',
				rawValue,
				tokenIndex,
				`find: ${token}: non-numeric argument: ${rawValue}`
			),
		};
	}

	return {
		value: Number.parseInt(rawValue, 10),
	};
}
