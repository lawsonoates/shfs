/**
 * cd command handler for the AST-based compiler.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import { literal, type SimpleCommandIR, type StepIR } from '../../../ir';

const ROOT_DIRECTORY = '/';

/**
 * Compile a cd command from SimpleCommandIR to StepIR.
 */
export function compileCd(cmd: SimpleCommandIR): StepIR {
	const result = compileCdEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileCdEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		const startsWithSeparator =
			cmd.args[0]?.kind === 'literal' && cmd.args[0].value === '--';
		const positionalArgs = startsWithSeparator
			? cmd.args.slice(1)
			: cmd.args;

		if (positionalArgs.length > 1) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'cd',
					'too-many-arguments',
					'cd accepts at most one path'
				)
			);
		}

		const path = positionalArgs[0] ?? literal(ROOT_DIRECTORY);
		return Result.ok({
			cmd: 'cd',
			args: { path },
		} as const satisfies StepIR);
	});
