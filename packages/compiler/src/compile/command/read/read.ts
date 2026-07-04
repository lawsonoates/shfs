import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileRead(cmd: SimpleCommandIR): StepIR {
	const result = compileReadEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileReadEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
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

		return Result.ok({
			cmd: 'read',
			args: { name },
		} as const satisfies StepIR);
	});
