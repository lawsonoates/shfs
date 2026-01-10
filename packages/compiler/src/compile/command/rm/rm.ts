import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compileRm(cmd: ShellCommand): StepIR {
	const recursive = cmd.args.includes('-r');
	const paths = cmd.args.filter((a) => a !== '-r' && a !== '-f' && a !== '-i');

	if (paths.length === 0) {
		throw new Error('rm requires at least one path');
	}

	return {
		args: { paths, recursive },
		cmd: 'rm',
	} as const;
}
