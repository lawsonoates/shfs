import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileString(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileStringEffect(cmd));
}

export const compileStringEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.string')(
	function* (cmd) {
		const [subcommand, ...operands] = cmd.args;
		if (!subcommand) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'string',
					'missing-subcommand',
					'string requires a subcommand'
				)
			);
		}

		return {
			cmd: 'string',
			args: {
				subcommand,
				operands,
			},
		} as const;
	}
);
