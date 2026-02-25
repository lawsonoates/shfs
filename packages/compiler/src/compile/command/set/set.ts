import {
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { createWordParser } from '../arg/parse';

const flags: Record<string, Flag> = {
	global: { short: 'g', takesValue: false },
	local: { short: 'l', takesValue: false },
};

const parseSetArgs = createWordParser(flags, expandedWordToString);

export function compileSet(cmd: SimpleCommandIR): StepIR {
	const parsed = parseSetArgs(cmd.args, { unknownFlagPolicy: 'error' });
	const isGlobal = parsed.flags.global === true;
	const isLocal = parsed.flags.local === true;
	if (isGlobal === isLocal) {
		throw new Error('set requires exactly one scope flag: -g or -l');
	}

	const [name, ...values] = parsed.positionalWords;
	if (!name) {
		throw new Error('set requires a variable name');
	}

	return {
		cmd: 'set',
		args: {
			scope: isGlobal ? 'global' : 'local',
			name,
			values,
		},
	} as const;
}
