import {
	type ExpandedWord,
	expandedWordParts,
	type SetStep,
} from '@shfs/compiler';
import { Result } from 'better-result';
import { runOrReport } from '../../diagnostics';
import {
	evaluateExpandedWordEffect,
	expandWordToValuesEffect,
	resolveExpandedIndexPositionsEffect,
} from '../../execute/path';
import {
	eraseVariable,
	isReadOnlyVariable,
	isValidVariableName,
	lookupVariable,
	setVariable,
	type VariableScope,
} from '../../execute/variables';
import type { Builtin, BuiltinRuntime } from '../types';

const ERASE_MISSING_STATUS = 4;

interface VariableTarget {
	name: string;
	index: string | null;
}

/**
 * Split a `name[index]` word into the name portion and the raw index text.
 * Depending on spacing, the lexer produces either a bracket glob part
 * (`x[1]`) or plain literal text (`x[1 .. 2]` after merging), so the
 * target is recovered from the combined raw text.
 */
async function resolveVariableTarget(
	runtime: BuiltinRuntime,
	word: ExpandedWord
): Promise<VariableTarget> {
	let combined = '';
	for (const part of expandedWordParts(word)) {
		if (part.kind === 'glob') {
			combined += part.pattern;
			continue;
		}
		const partResult = await evaluateExpandedWordEffect(
			part,
			runtime.fs,
			runtime.context
		);
		if (Result.isError(partResult)) {
			throw partResult.error;
		}
		combined += partResult.value;
	}

	const bracketStart = combined.indexOf('[');
	if (bracketStart !== -1 && combined.endsWith(']')) {
		return {
			index: combined.slice(bracketStart + 1, -1),
			name: combined.slice(0, bracketStart),
		};
	}
	return { index: null, name: combined };
}

function reportSetError(runtime: BuiltinRuntime, message: string): void {
	runtime.context.stderr.append(message);
	runtime.context.status = 1;
}

function guardVariableName(runtime: BuiltinRuntime, name: string): boolean {
	if (!isValidVariableName(name)) {
		reportSetError(runtime, `set: invalid variable name: ${name}`);
		return false;
	}
	if (isReadOnlyVariable(name)) {
		reportSetError(
			runtime,
			`set: Tried to change the read-only variable '${name}'`
		);
		return false;
	}
	return true;
}

async function expandValues(
	runtime: BuiltinRuntime,
	words: readonly ExpandedWord[]
): Promise<string[] | null> {
	const values: string[] = [];
	for (const word of words) {
		const expanded = await runOrReport(
			expandWordToValuesEffect(word, runtime.fs, runtime.context, {
				command: 'set',
				emptyGlobOk: true,
			}),
			runtime.context
		);
		if (!expanded.ok) {
			return null;
		}
		values.push(...expanded.value);
	}
	return values;
}

async function runAssign(
	runtime: BuiltinRuntime,
	args: SetStep['args']
): Promise<void> {
	const nameWord = args.names[0];
	if (!nameWord) {
		reportSetError(runtime, 'set: expected a variable name');
		return;
	}
	const target = await resolveVariableTarget(runtime, nameWord);
	if (!guardVariableName(runtime, target.name)) {
		return;
	}
	const values = await expandValues(runtime, args.values);
	if (values === null) {
		return;
	}

	if (target.index !== null) {
		if (args.append || args.prepend) {
			reportSetError(
				runtime,
				'set: Cannot use --append or --prepend when assigning to a slice'
			);
			return;
		}
		await assignByIndex(
			runtime,
			target.name,
			target.index,
			values,
			args.scope
		);
		return;
	}

	let nextValues = values;
	if (args.append || args.prepend) {
		const current = lookupVariable(runtime.context, target.name) ?? [];
		const appended = args.append ? values : [];
		const prepended = args.prepend ? values : [];
		nextValues = [...prepended, ...current, ...appended];
	}
	setVariable(runtime.context, target.name, nextValues, args.scope);
	// On success, set preserves the incoming $status (fish 3.0 behavior).
}

async function resolveSetIndexPositions(
	runtime: BuiltinRuntime,
	indexText: string,
	length: number
): Promise<number[]> {
	const positions = await resolveExpandedIndexPositionsEffect(
		indexText,
		length,
		runtime.fs,
		runtime.context
	);
	if (Result.isError(positions)) {
		throw positions.error;
	}
	return positions.value;
}

async function assignByIndex(
	runtime: BuiltinRuntime,
	name: string,
	indexText: string,
	values: string[],
	scope: VariableScope
): Promise<void> {
	const current = lookupVariable(runtime.context, name) ?? [];
	const positions = await resolveSetIndexPositions(
		runtime,
		indexText,
		current.length
	);
	if (positions.length !== values.length) {
		reportSetError(
			runtime,
			'set: The number of variable indexes does not match the number of values'
		);
		return;
	}
	const next = [...current];
	positions.forEach((position, valueIndex) => {
		const value = values[valueIndex];
		if (value !== undefined) {
			next[position - 1] = value;
		}
	});
	setVariable(runtime.context, name, next, scope);
}

async function runErase(
	runtime: BuiltinRuntime,
	args: SetStep['args']
): Promise<void> {
	let missing = false;
	for (const nameWord of args.names) {
		const target = await resolveVariableTarget(runtime, nameWord);
		if (!guardVariableName(runtime, target.name)) {
			return;
		}
		if (target.index === null) {
			if (!eraseVariable(runtime.context, target.name, args.scope)) {
				missing = true;
			}
			continue;
		}

		const current = lookupVariable(runtime.context, target.name);
		const positions = await resolveSetIndexPositions(
			runtime,
			target.index,
			current?.length ?? 0
		);
		if (current === undefined) {
			missing = true;
			continue;
		}
		const removed = new Set(positions);
		const next = current.filter((_value, index) => !removed.has(index + 1));
		setVariable(runtime.context, target.name, next, args.scope);
	}
	runtime.context.status = missing ? ERASE_MISSING_STATUS : 0;
}

async function runQuery(
	runtime: BuiltinRuntime,
	args: SetStep['args']
): Promise<void> {
	let missing = 0;
	for (const nameWord of args.names) {
		const target = await resolveVariableTarget(runtime, nameWord);
		const values = lookupVariable(runtime.context, target.name);
		if (values === undefined) {
			missing++;
			continue;
		}
		if (target.index !== null) {
			const positions = await resolveSetIndexPositions(
				runtime,
				target.index,
				values.length
			);
			if (positions.length === 0) {
				missing++;
			}
		}
	}
	runtime.context.status = missing;
}

async function runSetCommand(
	runtime: BuiltinRuntime,
	args: SetStep['args']
): Promise<void> {
	if (args.mode === 'erase') {
		await runErase(runtime, args);
		return;
	}
	if (args.mode === 'query') {
		await runQuery(runtime, args);
		return;
	}
	await runAssign(runtime, args);
}

export const set: Builtin<SetStep['args']> = (runtime, args) => {
	return (async function* () {
		await runSetCommand(runtime, args);
		yield* [];
	})();
};
