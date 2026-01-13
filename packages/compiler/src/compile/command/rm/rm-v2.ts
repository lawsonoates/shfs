/**
 * V2 rm command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIRV2,
} from '../../../ir';

/**
 * Compile a rm command from SimpleCommandIR to StepIRV2.
 */
export function compileRmV2(cmd: SimpleCommandIR): StepIRV2 {
	let recursive = false;
	const paths: ExpandedWord[] = [];

	for (const arg of cmd.args) {
		const argStr = expandedWordToString(arg);
		if (argStr === '-r') {
			recursive = true;
		} else if (argStr !== '-f' && argStr !== '-i') {
			paths.push(arg);
		}
	}

	if (paths.length === 0) {
		throw new Error('rm requires at least one path');
	}

	return {
		cmd: 'rm',
		args: { paths, recursive },
	} as const;
}
