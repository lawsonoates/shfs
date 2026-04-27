/**
 * Command handler registry for the AST-based compiler.
 *
 * This module provides handlers that accept SimpleCommandIR and produce StepIR.
 * Each handler extracts values from ExpandedWord types.
 */

import type { SimpleCommandIR, StepIR } from '../../ir';
import { compileCat } from './cat/cat';
import { compileCd } from './cd/cd';
import { compileCp } from './cp/cp';
import { compileEcho } from './echo/echo';
import { compileFind } from './find/find';
import { compileGrep } from './grep/grep';
import { compileHead } from './head/head';
import { compileLs } from './ls/ls';
import { compileMkdir } from './mkdir/mkdir';
import { compileMv } from './mv/mv';
import { compilePwd } from './pwd/pwd';
import { compileRead } from './read/read';
import { compileRm } from './rm/rm';
import { compileSet } from './set/set';
import { compileString } from './string/string';
import { compileTail } from './tail/tail';
import { compileTest } from './test/test';
import { compileTouch } from './touch/touch';
import { compileWc } from './wc/wc';
import { compileXargs } from './xargs/xargs';

/**
 * Handler function type for compiler.
 * Accepts a SimpleCommandIR and returns a StepIR.
 */
export type Handler = (cmd: SimpleCommandIR) => StepIR;

/**
 * Registry of command handlers for the compiler.
 */
export namespace CommandHandler {
	const handlers: Record<string, Handler> = {
		cat: compileCat,
		cd: compileCd,
		cp: compileCp,
		echo: compileEcho,
		find: compileFind,
		grep: compileGrep,
		head: compileHead,
		ls: compileLs,
		mkdir: compileMkdir,
		mv: compileMv,
		pwd: compilePwd,
		read: compileRead,
		rm: compileRm,
		set: compileSet,
		string: compileString,
		tail: compileTail,
		test: compileTest,
		touch: compileTouch,
		wc: compileWc,
		xargs: compileXargs,
	};

	/**
	 * Get a handler for a command name.
	 * @throws Error if the command is unknown
	 */
	export function get(name: string): Handler {
		const handler = handlers[name];
		if (!handler) {
			throw new Error(`Unknown command: ${name}`);
		}
		return handler;
	}

	/**
	 * Check if a handler exists for a command name.
	 */
	export function has(name: string): boolean {
		return name in handlers;
	}

	/**
	 * Register a custom handler.
	 */
	export function register(name: string, handler: Handler): void {
		handlers[name] = handler;
	}
}
