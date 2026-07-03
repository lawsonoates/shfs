import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileTest(cmd: SimpleCommandIR): StepIR {
	const result = compileTestEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileTestEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		if (cmd.args.length === 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'test',
					'missing-operands',
					'test requires operands'
				)
			);
		}

		return Result.ok({
			cmd: 'test',
			args: {
				operands: [...cmd.args],
			},
		} as const satisfies StepIR);
	});
