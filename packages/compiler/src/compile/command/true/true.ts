import { Result } from 'better-result';
import type { CompileError } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

export const compileTrueEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (_cmd) =>
	Result.ok({
		cmd: 'true',
		args: {},
	} as const satisfies StepIR);

export const compileFalseEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (_cmd) =>
	Result.ok({
		cmd: 'false',
		args: {},
	} as const satisfies StepIR);
