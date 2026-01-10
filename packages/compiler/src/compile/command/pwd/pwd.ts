import type { ShellCommand } from '../../../ast';
import type { StepIR } from '../../../ir';

export function compilePwd(_cmd: ShellCommand): StepIR {
	return {
		args: {},
		cmd: 'pwd',
	} as const;
}
