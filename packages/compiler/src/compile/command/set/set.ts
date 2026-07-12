import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	compound,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordParts,
	expandedWordToString,
	literal,
	type SetMode,
	type SetScope,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';

interface SetOptions {
	append: boolean;
	erase: boolean;
	global: boolean;
	local: boolean;
	prepend: boolean;
	query: boolean;
}

interface ParsedSetArgs {
	options: SetOptions;
	positional: ExpandedWord[];
}

const LONG_FLAGS: Record<string, keyof SetOptions> = {
	'--append': 'append',
	'--erase': 'erase',
	'--global': 'global',
	'--local': 'local',
	'--prepend': 'prepend',
	'--query': 'query',
};

const SHORT_FLAGS: Record<string, keyof SetOptions> = {
	a: 'append',
	e: 'erase',
	g: 'global',
	l: 'local',
	p: 'prepend',
	q: 'query',
};

function setError(code: string, message: string): CompileError {
	return new CompileError(createCommandDiagnostic('set', code, message));
}

function parseSetArgs(
	args: readonly ExpandedWord[]
): Result<ParsedSetArgs, CompileError> {
	const options: SetOptions = {
		append: false,
		erase: false,
		global: false,
		local: false,
		prepend: false,
		query: false,
	};
	const positional: ExpandedWord[] = [];
	let flagsDone = false;

	for (const arg of args) {
		const literalText = arg.kind === 'literal' ? arg.value : null;
		if (flagsDone || literalText === null || !literalText.startsWith('-')) {
			positional.push(arg);
			flagsDone = true;
			continue;
		}
		if (literalText === '--') {
			flagsDone = true;
			continue;
		}
		if (literalText.startsWith('--')) {
			const flag = LONG_FLAGS[literalText];
			if (!flag) {
				return Result.err(
					setError(
						'unknown-option',
						`set: unknown option: ${literalText}`
					)
				);
			}
			options[flag] = true;
			continue;
		}
		for (const shortFlag of literalText.slice(1)) {
			const flag = SHORT_FLAGS[shortFlag];
			if (!flag) {
				return Result.err(
					setError(
						'unknown-option',
						`set: unknown option: -${shortFlag}`
					)
				);
			}
			options[flag] = true;
		}
	}

	return Result.ok({ options, positional });
}

/**
 * Re-join a `name[...]` word whose index expression contains spaces:
 * the lexer splits `set x[1 .. 2] v` into several words, so words after
 * an unclosed `[` merge (space-separated) until the `]` appears.
 */
function mergeBracketWords(words: readonly ExpandedWord[]): {
	merged: ExpandedWord;
	consumed: number;
} {
	const first = words[0];
	if (!first) {
		return { consumed: 0, merged: literal('') };
	}
	const firstText = expandedWordToString(first);
	const bracketStart = firstText.indexOf('[');
	if (bracketStart === -1 || firstText.includes(']')) {
		return { consumed: 1, merged: first };
	}

	const parts: ExpandedWordPart[] = [...expandedWordParts(first)];
	let consumed = 1;
	while (consumed < words.length) {
		const next = words[consumed];
		if (!next) {
			break;
		}
		parts.push(literal(' '), ...expandedWordParts(next));
		consumed++;
		if (expandedWordToString(next).includes(']')) {
			break;
		}
	}
	return { consumed, merged: compound(parts) };
}

export function compileSet(cmd: SimpleCommandIR): StepIR {
	const result = compileSetEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileSetEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		const { options, positional } = yield* parseSetArgs(cmd.args);

		if (options.local && options.global) {
			return yield* setError(
				'invalid-option-combination',
				'set: -l and -g are mutually exclusive'
			);
		}
		if (options.erase && options.query) {
			return yield* setError(
				'invalid-option-combination',
				'set: -e and -q are mutually exclusive'
			);
		}

		const scope: SetScope = resolveScope(options);
		const mode: SetMode = resolveMode(options);

		if (mode === 'erase' || mode === 'query') {
			if (positional.length === 0) {
				return yield* setError(
					'missing-variable',
					`set: ${mode === 'erase' ? 'Erase' : 'Query'} needs a variable name`
				);
			}
			return Result.ok({
				cmd: 'set',
				args: {
					append: false,
					mode,
					names: positional,
					prepend: false,
					scope,
					values: [],
				},
			} as const satisfies StepIR);
		}

		if (positional.length === 0) {
			return yield* setError(
				'missing-variable',
				'set: expected a variable name'
			);
		}
		const { consumed, merged } = mergeBracketWords(positional);
		const values = positional.slice(consumed);

		return Result.ok({
			cmd: 'set',
			args: {
				append: options.append,
				mode: 'assign',
				names: [merged],
				prepend: options.prepend,
				scope,
				values,
			},
		} as const satisfies StepIR);
	});

function resolveScope(options: SetOptions): SetScope {
	if (options.global) {
		return 'global';
	}
	if (options.local) {
		return 'local';
	}
	return 'auto';
}

function resolveMode(options: SetOptions): SetMode {
	if (options.erase) {
		return 'erase';
	}
	if (options.query) {
		return 'query';
	}
	return 'assign';
}
