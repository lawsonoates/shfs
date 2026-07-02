/**
 * mv command handler for the AST-based compiler.
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
};

const parseMvArgs = createWordParser<ExpandedWord>(flags, expandedWordToString);

/**
 * Compile a mv command from SimpleCommandIR to StepIR.
 */
export function compileMv(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileMvEffect(cmd));
}

export const compileMvEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.mv')(
	function* (cmd) {
		const parsed = parseMvArgs(cmd.args, {
			unknownFlagPolicy: 'positional',
		});
		const force = parsed.flags.force === true;
		const interactive = parsed.flags.interactive === true;
		const filteredArgs = parsed.positionalWords;

		if (filteredArgs.length < 2) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'mv',
					'missing-operand',
					'mv requires source and destination'
				)
			);
		}

		const dest = filteredArgs.pop();
		if (!dest) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'mv',
					'missing-destination',
					'mv requires source and destination'
				)
			);
		}
		const srcs = filteredArgs;

		return {
			cmd: 'mv',
			args: { dest, force, interactive, srcs },
		} as const;
	}
);
