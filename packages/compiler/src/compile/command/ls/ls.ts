/**
 * ls command handler for the AST-based compiler.
 */

import {
	type ExpandedWord,
	expandedWordToString,
	literal,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { createWordParser } from '../arg/parse';

const flags: Record<string, Flag> = {
	longFormat: { short: 'l', takesValue: false },
	showAll: { short: 'a', takesValue: false },
};

const parseLsArgs = createWordParser<ExpandedWord>(flags, expandedWordToString);

/**
 * Compile an ls command from SimpleCommandIR to StepIR.
 */
export function compileLs(cmd: SimpleCommandIR): StepIR {
	const parsed = parseLsArgs(cmd.args, { unknownFlagPolicy: 'positional' });
	const paths: ExpandedWord[] =
		parsed.positionalWords.length === 0
			? [literal('.')]
			: parsed.positionalWords;
	const longFormat = parsed.flags.longFormat === true;
	const showAll = parsed.flags.showAll === true;

	return {
		cmd: 'ls',
		args: { longFormat, paths, showAll },
	} as const;
}
