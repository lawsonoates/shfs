import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compileTail(cmd: ShellCommand): StepIR {
	let n = 10; // default
	const files: string[] = [];

	for (let i = 0; i < cmd.args.length; i++) {
		const arg = cmd.args[i];

		if (!arg) continue;

		// Handle -n N format (e.g., -n 10)
		if (arg === '-n') {
			const numArg = cmd.args[++i];
			if (!numArg) {
				throw new Error('tail -n requires a number');
			}
			n = Number(numArg);
			if (!Number.isFinite(n)) {
				throw new Error('Invalid tail count');
			}
		}
		// Handle -N format (e.g., -10)
		else if (arg.startsWith('-') && /^-\d+$/.test(arg)) {
			n = Number(arg.slice(1));
		}
		// Everything else is a file
		else if (!arg.startsWith('-')) {
			files.push(arg);
		} else {
			throw new Error('Unknown tail option');
		}
	}

	return {
		args: { files, n },
		cmd: 'tail',
	} as const;
}
