import { createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type SortArgsIR,
	type SortCheckModeIR,
	type SortKeyIR,
	type SortKeyPositionIR,
	type StepIR,
} from '../../../ir';

const COMMAND = 'sort';
const CHECK_OPTION = 'c';
const QUIET_CHECK_OPTION = 'C';
const FIELD_SEPARATOR_OPTION = 't';
const KEY_OPTION = 'k';
const NUMERIC_OPTION = 'n';
const UNIQUE_OPTION = 'u';
const DEFAULT_CHECK_MODE: SortCheckModeIR = 'none';

interface ParseKeyPositionOptions {
	diagnostics: SortArgsIR['diagnostics'];
	partEnd: number;
	partStart: number;
	raw: string;
	token: string;
	tokenIndex: number;
	type: 'end' | 'start';
}

interface ParsedKeyPosition {
	numeric: boolean;
	position: SortKeyPositionIR;
}

export function compileSort(command: SimpleCommandIR): StepIR {
	return {
		cmd: COMMAND,
		args: parseSortArgs(command.args),
	} as const;
}

function createDefaultSortArgs(): SortArgsIR {
	return {
		checkMode: DEFAULT_CHECK_MODE,
		diagnostics: [],
		fieldSeparator: null,
		files: [],
		keys: [],
		numeric: false,
		unique: false,
	};
}

function parseSortArgs(argv: readonly ExpandedWord[]): SortArgsIR {
	const args = createDefaultSortArgs();

	for (let index = 0; index < argv.length; index += 1) {
		const word = argv[index];
		if (!word) {
			continue;
		}
		const token = expandedWordToString(word);
		if (token === '--') {
			args.files.push(...argv.slice(index + 1));
			break;
		}
		if (!isOptionToken(token)) {
			args.files.push(word);
			continue;
		}

		if (token === `-${KEY_OPTION}`) {
			const value = argv[index + 1];
			addSeparatedKey(args, value, token, index);
			index += 1;
			continue;
		}
		if (token.startsWith(`-${KEY_OPTION}`)) {
			addKey(args, token.slice(2), token, index);
			continue;
		}
		if (token === `-${FIELD_SEPARATOR_OPTION}`) {
			const value = argv[index + 1];
			addSeparatedFieldSeparator(args, value, token, index);
			index += 1;
			continue;
		}
		if (token.startsWith(`-${FIELD_SEPARATOR_OPTION}`)) {
			addFieldSeparator(args, token.slice(2), token, index);
			continue;
		}

		applyShortOptions(args, token, index);
	}

	return args;
}

function isOptionToken(token: string): boolean {
	return token.startsWith('-') && token !== '-';
}

function addSeparatedKey(
	args: SortArgsIR,
	value: ExpandedWord | undefined,
	token: string,
	tokenIndex: number
): void {
	if (!value) {
		addDiagnostic(
			args,
			'missing-key',
			'option requires an argument',
			token,
			tokenIndex
		);
		return;
	}
	addKey(args, expandedWordToString(value), token, tokenIndex);
}

function addKey(
	args: SortArgsIR,
	raw: string,
	token: string,
	tokenIndex: number
): void {
	const parsed = parseSortKey(raw, token, tokenIndex, args.diagnostics);
	if (parsed) {
		args.keys.push(parsed);
	}
}

function addSeparatedFieldSeparator(
	args: SortArgsIR,
	value: ExpandedWord | undefined,
	token: string,
	tokenIndex: number
): void {
	if (!value) {
		addDiagnostic(
			args,
			'missing-separator',
			'option requires an argument',
			token,
			tokenIndex
		);
		return;
	}
	addFieldSeparator(args, expandedWordToString(value), token, tokenIndex);
}

function addFieldSeparator(
	args: SortArgsIR,
	raw: string,
	token: string,
	tokenIndex: number
): void {
	const characters = Array.from(raw);
	const separator = characters.at(0);
	if (separator === undefined) {
		addDiagnostic(args, 'empty-separator', 'empty tab', token, tokenIndex);
		return;
	}
	if (characters.length > 1) {
		addDiagnostic(
			args,
			'multi-character-separator',
			`multi-character tab '${raw}'`,
			token,
			tokenIndex
		);
		return;
	}
	args.fieldSeparator = separator;
}

function applyShortOptions(
	args: SortArgsIR,
	token: string,
	tokenIndex: number
): void {
	const options = token.slice(1);

	for (const option of options) {
		switch (option) {
			case CHECK_OPTION:
				applyCheckMode(args, 'diagnose-first', token, tokenIndex);
				break;
			case QUIET_CHECK_OPTION:
				applyCheckMode(args, 'quiet', token, tokenIndex);
				break;
			case NUMERIC_OPTION:
				args.numeric = true;
				break;
			case UNIQUE_OPTION:
				args.unique = true;
				break;
			default:
				addDiagnostic(
					args,
					'unknown-option',
					`invalid option -- '${option}'`,
					token,
					tokenIndex
				);
		}
	}
}

function applyCheckMode(
	args: SortArgsIR,
	checkMode: SortCheckModeIR,
	token: string,
	tokenIndex: number
): void {
	if (args.checkMode !== 'none' && args.checkMode !== checkMode) {
		addDiagnostic(
			args,
			'incompatible-options',
			"options '-cC' are incompatible",
			token,
			tokenIndex
		);
	}
	args.checkMode = checkMode;
}

function parseSortKey(
	raw: string,
	token: string,
	tokenIndex: number,
	diagnostics: SortArgsIR['diagnostics']
): SortKeyIR | null {
	const commaIndex = raw.indexOf(',');
	const startEnd = commaIndex === -1 ? raw.length : commaIndex;
	const start = parseKeyPosition({
		diagnostics,
		partEnd: startEnd,
		partStart: 0,
		raw,
		token,
		tokenIndex,
		type: 'start',
	});
	const end =
		commaIndex === -1
			? null
			: parseKeyPosition({
					diagnostics,
					partEnd: raw.length,
					partStart: commaIndex + 1,
					raw,
					token,
					tokenIndex,
					type: 'end',
				});

	if (!start || (commaIndex !== -1 && !end)) {
		return null;
	}

	return {
		end: end?.position ?? null,
		options: {
			numeric: start.numeric || (end?.numeric ?? false),
		},
		raw,
		start: start.position,
	};
}

function parseKeyPosition(
	options: ParseKeyPositionOptions
): ParsedKeyPosition | null {
	const { diagnostics, partEnd, partStart, raw, token, tokenIndex, type } =
		options;
	const fieldDigits = readDigits(raw, partStart, partEnd);
	if (fieldDigits.value === '') {
		addInvalidNumberDiagnostic(
			diagnostics,
			raw,
			partStart,
			token,
			tokenIndex
		);
		return null;
	}

	const field = Number(fieldDigits.value);
	if (field === 0) {
		diagnostics.push(
			createSortDiagnostic(
				'invalid-key',
				`invalid field specification '${raw}'`,
				token,
				tokenIndex
			)
		);
		return null;
	}

	let cursor = fieldDigits.nextIndex;
	let character: number | null = null;
	if (raw.at(cursor) === '.' && cursor < partEnd) {
		const characterDigits = readDigits(raw, cursor + 1, partEnd);
		if (characterDigits.value === '') {
			addCharacterNumberDiagnostic(
				diagnostics,
				raw,
				cursor + 1,
				token,
				tokenIndex
			);
			return null;
		}
		character = Number(characterDigits.value);
		if (character === 0 && type === 'start') {
			diagnostics.push(
				createSortDiagnostic(
					'invalid-key',
					'character offset is zero',
					token,
					tokenIndex
				),
				createSortDiagnostic(
					'invalid-key',
					`invalid field specification '${raw}'`,
					token,
					tokenIndex
				)
			);
			return null;
		}
		cursor = characterDigits.nextIndex;
	}

	const ordering = readOrderingOptions(
		raw,
		cursor,
		partEnd,
		token,
		tokenIndex,
		diagnostics
	);
	if (!ordering) {
		return null;
	}

	return {
		numeric: ordering.numeric,
		position: { character, field },
	};
}

function readDigits(
	text: string,
	start: number,
	end: number
): { nextIndex: number; value: string } {
	let cursor = start;
	while (cursor < end) {
		const character = text.at(cursor);
		if (character === undefined || character < '0' || character > '9') {
			break;
		}
		cursor += 1;
	}
	return {
		nextIndex: cursor,
		value: text.slice(start, cursor),
	};
}

function readOrderingOptions(
	raw: string,
	start: number,
	end: number,
	token: string,
	tokenIndex: number,
	diagnostics: SortArgsIR['diagnostics']
): { numeric: boolean } | null {
	let numeric = false;
	for (let cursor = start; cursor < end; cursor += 1) {
		const option = raw.at(cursor);
		if (option === NUMERIC_OPTION) {
			numeric = true;
			continue;
		}
		diagnostics.push(
			createSortDiagnostic(
				'invalid-key',
				`invalid count at start of '${raw.slice(cursor)}'`,
				token,
				tokenIndex
			)
		);
		return null;
	}
	return { numeric };
}

function addInvalidNumberDiagnostic(
	diagnostics: SortArgsIR['diagnostics'],
	raw: string,
	position: number,
	token: string,
	tokenIndex: number
): void {
	diagnostics.push(
		createSortDiagnostic(
			'invalid-key',
			"invalid number after ','",
			token,
			tokenIndex
		),
		createSortDiagnostic(
			'invalid-key',
			`invalid count at start of '${raw.slice(position)}'`,
			token,
			tokenIndex
		)
	);
}

function addCharacterNumberDiagnostic(
	diagnostics: SortArgsIR['diagnostics'],
	raw: string,
	position: number,
	token: string,
	tokenIndex: number
): void {
	diagnostics.push(
		createSortDiagnostic(
			'invalid-key',
			"invalid number after '.'",
			token,
			tokenIndex
		),
		createSortDiagnostic(
			'invalid-key',
			`invalid count at start of '${raw.slice(position)}'`,
			token,
			tokenIndex
		)
	);
}

function addDiagnostic(
	args: SortArgsIR,
	code: string,
	message: string,
	token: string,
	tokenIndex: number
): void {
	args.diagnostics.push(
		createSortDiagnostic(code, message, token, tokenIndex)
	);
}

function createSortDiagnostic(
	code: string,
	message: string,
	token: string,
	tokenIndex: number
): SortArgsIR['diagnostics'][number] {
	return createCommandDiagnostic(COMMAND, code, message, {
		token,
		tokenIndex,
	});
}
