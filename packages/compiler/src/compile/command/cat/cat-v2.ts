/**
 * V2 cat command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	type SimpleCommandIR,
	type StepIRV2,
	expandedWordToString,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { parseArgs } from '../arg/parse';

const flags: Record<string, Flag> = {
	number: { short: 'n', takesValue: false },
	numberNonBlank: { short: 'b', takesValue: false },
	showAll: { short: 'A', takesValue: false },
	showEnds: { short: 'E', takesValue: false },
	showNonprinting: { short: 'v', takesValue: false },
	showTabs: { short: 'T', takesValue: false },
	squeezeBlank: { short: 's', takesValue: false },
};

/**
 * Compile a cat command from SimpleCommandIR to StepIRV2.
 */
export function compileCatV2(cmd: SimpleCommandIR): StepIRV2 {
	// Convert ExpandedWord[] to string[] for arg parsing
	const argStrings = cmd.args.map(expandedWordToString);

	const parsed = parseArgs(argStrings, flags);

	// Filter to get only positional arguments (files)
	const fileArgs: ExpandedWord[] = [];
	for (let i = 0; i < cmd.args.length; i++) {
		const argStr = expandedWordToString(cmd.args[i]!);
		// Skip flags
		if (!argStr.startsWith('-')) {
			fileArgs.push(cmd.args[i]!);
		}
	}

	if (fileArgs.length === 0) {
		throw new Error('cat requires at least one file');
	}

	return {
		cmd: 'cat',
		args: {
			files: fileArgs,
			numberLines: parsed.flags.number === true,
			numberNonBlank: parsed.flags.numberNonBlank === true,
			showAll: parsed.flags.showAll === true,
			showEnds: parsed.flags.showEnds === true,
			showNonprinting: parsed.flags.showNonprinting === true,
			showTabs: parsed.flags.showTabs === true,
			squeezeBlank: parsed.flags.squeezeBlank === true,
		},
	} as const;
}
