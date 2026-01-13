/**
 * Command handler registry for the V2 AST-based compiler.
 *
 * This module provides handlers that accept SimpleCommandIR and produce StepIRV2.
 * Each handler extracts values from ExpandedWord types.
 */

import type { SimpleCommandIR, StepIRV2 } from '../../ir';
import { compileCatV2 } from './cat/cat-v2';
import { compileCpV2 } from './cp/cp-v2';
import { compileHeadV2 } from './head/head-v2';
import { compileLsV2 } from './ls/ls-v2';
import { compileMkdirV2 } from './mkdir/mkdir-v2';
import { compileMvV2 } from './mv/mv-v2';
import { compileRmV2 } from './rm/rm-v2';
import { compileTailV2 } from './tail/tail-v2';
import { compileTouchV2 } from './touch/touch-v2';

/**
 * Handler function type for V2 compiler.
 * Accepts a SimpleCommandIR and returns a StepIRV2.
 */
export type HandlerV2 = (cmd: SimpleCommandIR) => StepIRV2;

/**
 * Registry of command handlers for the V2 compiler.
 */
export namespace CommandHandlerV2 {
	const handlers: Record<string, HandlerV2> = {
		cat: compileCatV2,
		cp: compileCpV2,
		head: compileHeadV2,
		ls: compileLsV2,
		mkdir: compileMkdirV2,
		mv: compileMvV2,
		rm: compileRmV2,
		tail: compileTailV2,
		touch: compileTouchV2,
	};

	/**
	 * Get a handler for a command name.
	 * @throws Error if the command is unknown
	 */
	export function get(name: string): HandlerV2 {
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
	export function register(name: string, handler: HandlerV2): void {
		handlers[name] = handler;
	}
}
