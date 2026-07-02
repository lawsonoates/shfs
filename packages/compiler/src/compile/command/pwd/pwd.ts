/**
 * pwd command handler for the AST-based compiler.
 */

import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

/**
 * Compile a pwd command from SimpleCommandIR to StepIR.
 */
export function compilePwd(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compilePwdEffect(cmd));
}

export const compilePwdEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.pwd')(
	function* (cmd) {
		if (cmd.args.length > 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'pwd',
					'unexpected-argument',
					'pwd does not take any arguments'
				)
			);
		}

		return {
			cmd: 'pwd',
			args: {},
		} as const;
	}
);
