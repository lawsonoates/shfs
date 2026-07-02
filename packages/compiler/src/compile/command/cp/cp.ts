/**
 * cp command handler for the AST-based compiler.
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

const parseCpArgs = createWordParser<ExpandedWord>(flags, expandedWordToString);

/**
 * Compile a cp command from SimpleCommandIR to StepIR.
 */
export function compileCp(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileCpEffect(cmd));
}

export const compileCpEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.cp')(
	function* (cmd) {
		const parsed = parseCpArgs(cmd.args, {
			unknownFlagPolicy: 'positional',
		});
		const recursive = parsed.flags.recursive === true;
		const force = parsed.flags.force === true;
		const interactive = parsed.flags.interactive === true;
		const filteredArgs = parsed.positionalWords;

		if (filteredArgs.length < 2) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'cp',
					'missing-operand',
					'cp requires source and destination'
				)
			);
		}

		const dest = filteredArgs.pop();
		if (!dest) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'cp',
					'missing-destination',
					'cp requires source and destination'
				)
			);
		}
		const srcs = filteredArgs;

		return {
			cmd: 'cp',
			args: { dest, force, interactive, recursive, srcs },
		} as const;
	}
);
