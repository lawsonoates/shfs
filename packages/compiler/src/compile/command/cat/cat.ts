import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compileCat(cmd: ShellCommand): StepIR {
	if (cmd.args.length === 0) {
		throw new Error('cat requires at least one file');
	}
	return {
		args: { files: cmd.args },
		cmd: 'cat',
	} as const;
}
