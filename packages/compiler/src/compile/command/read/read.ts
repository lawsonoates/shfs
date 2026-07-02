import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileRead(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileReadEffect(cmd));
}

export const compileReadEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.read')(
	function* (cmd) {
		if (cmd.args.length !== 1) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'read',
					'invalid-argument-count',
					'read requires exactly one variable name'
				)
			);
		}

		const name = cmd.args[0];
		if (!name) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'read',
					'missing-variable',
					'read requires exactly one variable name'
				)
			);
		}

		return {
			cmd: 'read',
			args: { name },
		} as const;
	}
);
