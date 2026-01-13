/**
 * V2 touch command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	type SimpleCommandIR,
	type StepIRV2,
	expandedWordToString,
} from '../../../ir';

/**
 * Compile a touch command from SimpleCommandIR to StepIRV2.
 */
export function compileTouchV2(cmd: SimpleCommandIR): StepIRV2 {
	const files: ExpandedWord[] = [];

	for (const arg of cmd.args) {
		const argStr = expandedWordToString(arg);
		if (!argStr.startsWith('-')) {
			files.push(arg);
		}
	}

	if (files.length === 0) {
		throw new Error('touch requires at least one file');
	}

	return {
		cmd: 'touch',
		args: { files },
	} as const;
}
