import { Result } from 'better-result';
import type { CompileError } from '../../../diagnostic';
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
) => Result<StepIR, CompileError> = (cmd) => {
	const [subcommand, ...operands] = cmd.args;
	return Result.ok({
		cmd: 'string',
		args: {
			subcommand: subcommand ?? null,
			operands,
		},
	} as const satisfies StepIR);
};
