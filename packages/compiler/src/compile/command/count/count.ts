import { Result } from 'better-result';
import type { CompileError } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export const compileCountEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.ok({
		cmd: 'count',
		args: {
			values: [...cmd.args],
		},
	} as const satisfies StepIR);
