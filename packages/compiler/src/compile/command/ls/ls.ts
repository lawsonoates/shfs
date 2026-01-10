import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compileLs(cmd: ShellCommand): StepIR {
	const paths = cmd.args.length === 0 ? ['.'] : cmd.args;
	return {
		args: { paths },
		cmd: 'ls',
	} as const;
}
