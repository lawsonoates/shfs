/**
 * Variable scope and slice-index helpers for the fish scripting subset.
 *
 * Variables are lists of strings. Local frames stack on top of the global
 * map; function calls push a barrier frame that hides caller locals while
 * keeping globals visible.
 */

import { Result } from 'better-result';
import type { BuiltinContext, VariableFrame } from '../builtin/types';
import { type ShellErrorCause, ShellRuntimeError } from '../diagnostics';

const VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INTEGER_INDEX_REGEX = /^[+-]?\d+$/;

/** Variables that cannot be assigned or used as loop variables. */
const READ_ONLY_VARIABLES = new Set(['status']);

export type VariableScope = 'auto' | 'global' | 'local';

export function isValidVariableName(name: string): boolean {
	return VARIABLE_NAME_REGEX.test(name);
}

export function isReadOnlyVariable(name: string): boolean {
	return READ_ONLY_VARIABLES.has(name);
}

/**
 * Iterate the frames visible from the innermost scope: local frames from
 * the top of the stack down to (and including) the closest barrier frame.
 */
function* visibleFrames(context: BuiltinContext): Generator<VariableFrame> {
	for (let index = context.scopes.length - 1; index >= 0; index--) {
		const frame = context.scopes[index];
		if (!frame) {
			continue;
		}
		yield frame;
		if (frame.barrier) {
			return;
		}
	}
}

/**
 * Look up a variable by name, walking visible local frames then globals.
 * `status` resolves to the current exit status.
 */
export function lookupVariable(
	context: BuiltinContext,
	name: string
): string[] | undefined {
	if (name === 'status') {
		return [String(context.status)];
	}
	for (const frame of visibleFrames(context)) {
		const values = frame.vars.get(name);
		if (values !== undefined) {
			return values;
		}
	}
	return context.globalVars.get(name);
}

/**
 * The frame that unscoped `set` creates new variables in: the closest
 * function barrier frame, or the script-level frame outside functions.
 */
export function functionScopeFrame(context: BuiltinContext): VariableFrame {
	for (let index = context.scopes.length - 1; index >= 0; index--) {
		const frame = context.scopes[index];
		if (frame?.barrier) {
			return frame;
		}
	}
	const scriptFrame = context.scopes[0];
	if (!scriptFrame) {
		throw new Error('Variable scope stack is empty');
	}
	return scriptFrame;
}

/** The innermost local frame (target of `set -l`). */
export function innermostFrame(context: BuiltinContext): VariableFrame {
	const frame = context.scopes.at(-1);
	if (!frame) {
		throw new Error('Variable scope stack is empty');
	}
	return frame;
}

/**
 * Set a variable in the requested scope. `auto` updates the variable in
 * place when it is visible, otherwise creates it in the function scope.
 */
export function setVariable(
	context: BuiltinContext,
	name: string,
	values: string[],
	scope: VariableScope
): void {
	if (scope === 'global') {
		context.globalVars.set(name, values);
		return;
	}
	if (scope === 'local') {
		innermostFrame(context).vars.set(name, values);
		return;
	}
	for (const frame of visibleFrames(context)) {
		if (frame.vars.has(name)) {
			frame.vars.set(name, values);
			return;
		}
	}
	if (context.globalVars.has(name)) {
		context.globalVars.set(name, values);
		return;
	}
	functionScopeFrame(context).vars.set(name, values);
}

/**
 * Erase a variable in the requested scope.
 * Auto scope erases the closest visible definition, exposing outer ones.
 *
 * @returns true when a variable was erased.
 */
export function eraseVariable(
	context: BuiltinContext,
	name: string,
	scope: VariableScope
): boolean {
	if (scope === 'global') {
		return context.globalVars.delete(name);
	}
	if (scope === 'local') {
		return innermostFrame(context).vars.delete(name);
	}
	for (const frame of visibleFrames(context)) {
		if (frame.vars.delete(name)) {
			return true;
		}
	}
	return context.globalVars.delete(name);
}

/**
 * Check whether a variable is set (used by `set -q`).
 */
export function isVariableSet(context: BuiltinContext, name: string): boolean {
	return lookupVariable(context, name) !== undefined;
}

// ─────────────────────────────────────────────────────────
// Slice / index expressions
// ─────────────────────────────────────────────────────────

interface IndexToken {
	kind: 'value' | 'range';
	text: string;
}

function invalidIndexError(): ShellRuntimeError {
	return new ShellRuntimeError({
		exitCode: 1,
		message: 'Invalid index value',
	});
}

function zeroIndexError(): ShellRuntimeError {
	return new ShellRuntimeError({
		exitCode: 1,
		message: 'array indices start at 1, not 0.',
	});
}

/**
 * Tokenize an index expression into value and `..` tokens.
 * Values are integers or `$name` references.
 */
function tokenizeIndexExpression(
	text: string
): Result<IndexToken[], ShellErrorCause> {
	const tokens: IndexToken[] = [];
	let position = 0;

	while (position < text.length) {
		const char = text[position];
		if (char === ' ' || char === '\t') {
			position++;
			continue;
		}
		if (char === '.' && text[position + 1] === '.') {
			tokens.push({ kind: 'range', text: '..' });
			position += 2;
			continue;
		}
		let value = '';
		while (position < text.length) {
			const c = text[position];
			if (c === undefined || c === ' ' || c === '\t') {
				break;
			}
			if (c === '.' && text[position + 1] === '.') {
				break;
			}
			value += c;
			position++;
		}
		if (value === '') {
			return Result.err(invalidIndexError());
		}
		tokens.push({ kind: 'value', text: value });
	}

	return Result.ok(tokens);
}

function resolveIndexValue(
	context: BuiltinContext,
	text: string
): Result<number, ShellErrorCause> {
	let raw = text;
	if (raw.startsWith('$')) {
		const name = raw.slice(1);
		if (!isValidVariableName(name)) {
			return Result.err(invalidIndexError());
		}
		const values = lookupVariable(context, name) ?? [];
		if (values.length !== 1 || values[0] === undefined) {
			return Result.err(invalidIndexError());
		}
		raw = values[0];
	}
	if (!INTEGER_INDEX_REGEX.test(raw)) {
		return Result.err(invalidIndexError());
	}
	const value = Number.parseInt(raw, 10);
	if (value === 0) {
		return Result.err(zeroIndexError());
	}
	return Result.ok(value);
}

function toPosition(index: number, length: number): number {
	return index > 0 ? index : length + 1 + index;
}

/**
 * Append the positions selected by a range, following fish's parse_slice:
 * when exactly one endpoint is negative the direction is forced (so
 * `2..-1` never runs backwards on short lists); otherwise endpoints clamp
 * to the list size and the direction follows the resolved order.
 * Out-of-bounds positions are filtered by the caller.
 */
function appendRangePositions(
	positions: number[],
	rawStart: number,
	rawEnd: number,
	length: number
): void {
	let from = toPosition(rawStart, length);
	let to = toPosition(rawEnd, length);
	if (from > length && to > length) {
		return;
	}
	let direction = to < from ? -1 : 1;
	if (rawStart > 0 !== rawEnd > 0) {
		// Only the beginning is negative: always go in reverse.
		// Only the end is negative: always go forward.
		direction = rawEnd > 0 ? -1 : 1;
	} else {
		from = Math.min(from, length);
		to = Math.min(to, length);
	}
	for (
		let position = from;
		position * direction <= to * direction;
		position += direction
	) {
		positions.push(position);
	}
}

/**
 * Resolve an index expression against a list length, producing 1-based
 * positions in selection order. Out-of-range single indices are skipped;
 * ranges clamp to the list bounds and can run backwards.
 *
 * Grammar per atom: `N`, `N..M`, `..M`, `N..`, `..`, where values are
 * integers or `$name` references and whitespace may surround `..`.
 * A `..` directly following a completed range is an invalid index
 * (e.g. `1..2..`).
 */
export function resolveIndexPositions(
	context: BuiltinContext,
	indexText: string,
	length: number
): Result<number[], ShellErrorCause> {
	return Result.gen(function* () {
		const tokens = yield* tokenizeIndexExpression(indexText);
		const positions: number[] = [];
		let cursor = 0;

		while (cursor < tokens.length) {
			let start: number | null = null;
			const startToken = tokens[cursor];
			if (startToken?.kind === 'value') {
				start = yield* resolveIndexValue(context, startToken.text);
				cursor++;
			}

			if (tokens[cursor]?.kind !== 'range') {
				if (start === null) {
					return yield* invalidIndexError();
				}
				positions.push(toPosition(start, length));
				continue;
			}
			cursor++; // ..

			let end: number | null = null;
			const endToken = tokens[cursor];
			if (endToken?.kind === 'value') {
				end = yield* resolveIndexValue(context, endToken.text);
				cursor++;
			}

			// A range immediately after this one has no start value.
			if (tokens[cursor]?.kind === 'range') {
				return yield* invalidIndexError();
			}

			appendRangePositions(positions, start ?? 1, end ?? -1, length);
		}

		return Result.ok(
			positions.filter((position) => position >= 1 && position <= length)
		);
	});
}

/**
 * Select list elements by an index expression.
 */
export function selectByIndex(
	context: BuiltinContext,
	values: string[],
	indexText: string
): Result<string[], ShellErrorCause> {
	return Result.gen(function* () {
		const positions = yield* resolveIndexPositions(
			context,
			indexText,
			values.length
		);
		const selected: string[] = [];
		for (const position of positions) {
			const value = values[position - 1];
			if (value !== undefined) {
				selected.push(value);
			}
		}
		return Result.ok(selected);
	});
}
