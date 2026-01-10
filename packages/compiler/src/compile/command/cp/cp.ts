import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compileCp(cmd: ShellCommand): StepIR {
	const recursive = cmd.args.includes('-r');
	const args = cmd.args.filter((a) => a !== '-r' && a !== '-f' && a !== '-i');

	if (args.length < 2) {
		throw new Error('cp requires source and destination');
	}

	const dest = args.pop();
	if (!dest) {
		throw new Error('cp requires source and destination');
	}
	const srcs = args;

	return {
		args: { dest, recursive, srcs },
		cmd: 'cp',
	} as const;
}
