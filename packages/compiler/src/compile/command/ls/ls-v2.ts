/**
 * V2 ls command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	literal,
	type SimpleCommandIR,
	type StepIRV2,
} from '@/ir';

/**
 * Compile an ls command from SimpleCommandIR to StepIRV2.
 */
export function compileLsV2(cmd: SimpleCommandIR): StepIRV2 {
	const paths: ExpandedWord[] =
		cmd.args.length === 0 ? [literal('.')] : cmd.args;

	return {
		cmd: 'ls',
		args: { paths },
	} as const;
}
