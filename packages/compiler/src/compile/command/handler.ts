import type { ShellCommand } from '../../ast';
import type { StepIR } from '../../ir';
import { compileCat } from './cat/cat';
import { compileCp } from './cp/cp';
import { compileLs } from './ls/ls';
import { compilePwd } from './pwd/pwd';
import { compileRm } from './rm/rm';
import { compileTail } from './tail/tail';

export type Handler = (cmd: ShellCommand) => StepIR;

export namespace CommandHandler {
	const handlers: Record<string, Handler> = {
		cat: compileCat,
		cp: compileCp,
		ls: compileLs,
		pwd: compilePwd,
		rm: compileRm,
		tail: compileTail,
	};

	export function get(name: string): Handler {
		const handler = handlers[name];
		if (!handler) {
			throw new Error(`Unknown command: ${name}`);
		}

		return handler;
	}
}
