import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileString(cmd: SimpleCommandIR): StepIR {
	const result = compileStringEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileStringEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
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

		return Result.ok({
			cmd: 'string',
			args: {
				subcommand,
				operands,
			},
		} as const satisfies StepIR);
	});
