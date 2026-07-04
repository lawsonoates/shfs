/**
 * pwd command handler for the AST-based compiler.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../../ir';

/**
 * Compile a pwd command from SimpleCommandIR to StepIR.
 */
export function compilePwd(cmd: SimpleCommandIR): StepIR {
	const result = compilePwdEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compilePwdEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		if (cmd.args.length > 0) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'pwd',
					'unexpected-argument',
					'pwd does not take any arguments'
				)
			);
		}

		return Result.ok({
			cmd: 'pwd',
			args: {},
		} as const satisfies StepIR);
	});
