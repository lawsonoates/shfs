import { Effect } from 'effect';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileTest(cmd: SimpleCommandIR): StepIR {
	return Effect.runSync(compileTestEffect(cmd));
}

export const compileTestEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.test')(
	function* (cmd) {
		if (cmd.args.length === 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'test',
					'missing-operands',
					'test requires operands'
				)
			);
		}

		return {
			cmd: 'test',
			args: {
				operands: [...cmd.args],
			},
		} as const;
	}
);
