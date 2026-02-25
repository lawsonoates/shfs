/**
 * cd command handler for the AST-based compiler.
 */

import { literal, type SimpleCommandIR, type StepIR } from '../../../ir';

const ROOT_DIRECTORY = '/';

/**
 * Compile a cd command from SimpleCommandIR to StepIR.
 */
export function compileCd(cmd: SimpleCommandIR): StepIR {
	const startsWithSeparator =
		cmd.args[0]?.kind === 'literal' && cmd.args[0].value === '--';
	const positionalArgs = startsWithSeparator ? cmd.args.slice(1) : cmd.args;

	if (positionalArgs.length > 1) {
		throw new Error('cd accepts at most one path');
	}

	const path = positionalArgs[0] ?? literal(ROOT_DIRECTORY);
	return {
		cmd: 'cd',
		args: { path },
	} as const;
}
