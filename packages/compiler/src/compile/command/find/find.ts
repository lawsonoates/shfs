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
};

const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;

interface FindParseState {
	action: FindActionIR;
	currentBranch: FindPredicateIR[];
	diagnostics: FindDiagnosticIR[];
	lastOrTokenIndex: number | null;
	predicateBranches: FindPredicateIR[][];
	sawOr: boolean;
	traversal: FindTraversalIR;
}

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
		diagnostics: [],
		lastOrTokenIndex: null,
		predicateBranches: [],
		sawOr: false,
		traversal: { ...DEFAULT_TRAVERSAL },
	};
	const predicateStartIndex = findPredicateStartIndex(argv);
	const explicitStartPaths = argv.slice(0, predicateStartIndex);
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

function findPredicateStartIndex(argv: ExpandedWord[]): number {
	for (const [index, word] of argv.entries()) {
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
	if (token === '-name' || token === '-path') {
		return parseStringPredicate(argv, index, token, state);
	}
	if (token === '-type') {
		return parseTypePredicate(argv, index, state);
	}
	if (token === '-o' || token === '-or') {
		return parseOrPredicateSeparator(index, state);
	}
	if (token === '-maxdepth' || token === '-mindepth') {
		return parseTraversalOption(argv, index, token, state);
	}
	if (token === '-depth') {
		state.traversal.depth = true;
		return index + 1;
	}
	if (token === '-print') {
		state.action.explicit = true;
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

function parseOrPredicateSeparator(
	index: number,
	state: FindParseState
): number {
	state.sawOr = true;
	state.lastOrTokenIndex = index;

	if (state.currentBranch.length === 0) {
		state.diagnostics.push(
			createMissingExpressionDiagnostic('left', index)
		);
		return index + 1;
	}

	state.predicateBranches.push(state.currentBranch);
	state.currentBranch = [];
	return index + 1;
}

function parseStringPredicate(
	argv: ExpandedWord[],
	index: number,
	token: '-name' | '-path',
	state: FindParseState
): number {
	const valueWord = argv[index + 1];
	if (!valueWord) {
		state.diagnostics.push(createMissingValueDiagnostic(token, index));
		return index + 1;
	}

	state.currentBranch.push({
		kind: token === '-name' ? 'name' : 'path',
		pattern: valueWord,
	});
	return index + 2;
}

function parseTypePredicate(
	argv: ExpandedWord[],
	index: number,
	state: FindParseState
): number {
	const valueWord = argv[index + 1];
	if (!valueWord) {
		state.diagnostics.push(createMissingValueDiagnostic('-type', index));
		return index + 1;
	}

	const parsedType = parseFindTypeValue(valueWord, index + 1);
	if ('diagnostic' in parsedType) {
		state.diagnostics.push(parsedType.diagnostic);
	} else {
		state.currentBranch.push({
			kind: 'type',
			types: parsedType.types,
		});
	}
	return index + 2;
}

function finalizePredicateBranches(state: FindParseState): FindPredicateIR[][] {
	if (state.currentBranch.length > 0) {
		state.predicateBranches.push(state.currentBranch);
	} else if (state.sawOr && state.lastOrTokenIndex !== null) {
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
	return index + 2;
}

function parseFindTypeValue(
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
				'find: Arguments to -type should contain at least one letter'
			),
		};
	}
	if (rawValue.endsWith(',')) {
		return {
			diagnostic: createDiagnostic(
				'invalid-value',
				rawValue,
				tokenIndex,
				'find: Last file type in list argument to -type is missing'
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
				'find: File type in list argument to -type is missing'
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
		if (part !== 'd' && part !== 'f') {
			return {
				diagnostic: createDiagnostic(
					'invalid-value',
					rawValue,
					tokenIndex,
					`find: Unknown argument to -type: ${part}`
				),
			};
		}
		if (seen.has(part)) {
			return {
				diagnostic: createDiagnostic(
					'invalid-value',
					rawValue,
					tokenIndex,
					`find: Duplicate file type in list argument to -type: ${part}`
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
