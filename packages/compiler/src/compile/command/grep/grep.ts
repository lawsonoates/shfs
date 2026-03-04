import type { SimpleCommandIR, StepIR } from '../../../ir';

/**
 * Compile a grep command from SimpleCommandIR to StepIR.
 *
 * grep's option semantics are broad and order-sensitive, so runtime
 * parsing is delegated to the shfs grep operator.
 */
export function compileGrep(cmd: SimpleCommandIR): StepIR {
	return {
		cmd: 'grep',
		args: {
			argv: cmd.args,
		},
	} as const;
}
