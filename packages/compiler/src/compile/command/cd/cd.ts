/**
 * cd command handler for the AST-based compiler.
 */

import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import { literal, type SimpleCommandIR, type StepIR } from '../../../ir';

const ROOT_DIRECTORY = '/';

/**
 * Compile a cd command from SimpleCommandIR to StepIR.
 */
export function compileCd(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileCdEffect(cmd));
}

export const compileCdEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.cd')(
	function* (cmd) {
		const startsWithSeparator =
			cmd.args[0]?.kind === 'literal' && cmd.args[0].value === '--';
		const positionalArgs = startsWithSeparator
			? cmd.args.slice(1)
			: cmd.args;

		if (positionalArgs.length > 1) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'cd',
					'too-many-arguments',
					'cd accepts at most one path'
				)
			);
		}

		const path = positionalArgs[0] ?? literal(ROOT_DIRECTORY);
		return {
			cmd: 'cd',
			args: { path },
		} as const;
	}
);
