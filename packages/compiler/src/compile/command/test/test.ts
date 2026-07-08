import { Result } from 'better-result';
import type { CompileError } from '../../../diagnostic';
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
	Result.ok({
		cmd: 'test',
		args: {
			bracket: false,
			operands: [...cmd.args],
		},
	} as const satisfies StepIR);

/**
 * The `[` alias parses like test; the runtime validates the closing `]`.
 */
export const compileBracketTestEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.ok({
		cmd: 'test',
		args: {
			bracket: true,
			operands: [...cmd.args],
		},
	} as const satisfies StepIR);
