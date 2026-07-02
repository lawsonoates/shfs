/**
 * rm command handler for the AST-based compiler.
 */

import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { createWordParser } from '../arg/parse';

const flags: Record<string, Flag> = {
	force: { short: 'f', takesValue: false },
	interactive: { short: 'i', takesValue: false },
	recursive: { short: 'r', takesValue: false },
};

const parseRmArgs = createWordParser<ExpandedWord>(flags, expandedWordToString);

/**
 * Compile a rm command from SimpleCommandIR to StepIR.
 */
export function compileRm(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileRmEffect(cmd));
}

export const compileRmEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.rm')(
	function* (cmd) {
		const parsed = parseRmArgs(cmd.args, {
			unknownFlagPolicy: 'positional',
		});
		const recursive = parsed.flags.recursive === true;
		const force = parsed.flags.force === true;
		const interactive = parsed.flags.interactive === true;
		const paths = parsed.positionalWords;

		if (paths.length === 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'rm',
					'missing-path',
					'rm requires at least one path'
				)
			);
		}

		return {
			cmd: 'rm',
			args: { force, interactive, paths, recursive },
		} as const;
	}
);
