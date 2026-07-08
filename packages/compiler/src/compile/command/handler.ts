/**
 * Command handler registry for the AST-based compiler.
 *
 * This module provides handlers that accept SimpleCommandIR and produce StepIR.
 * Each handler extracts values from ExpandedWord types.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../diagnostic';
import type { SimpleCommandIR, StepIR } from '../../ir';
import { compileCatEffect } from './cat/cat';
import { compileCdEffect } from './cd/cd';
import { compileCountEffect } from './count/count';
import { compileCpEffect } from './cp/cp';
import { compileEcho } from './echo/echo';
import { compileFind } from './find/find';
import { compileGrep } from './grep/grep';
import { compileHeadEffect } from './head/head';
import { compileLs } from './ls/ls';
import { compileMkdirEffect } from './mkdir/mkdir';
import { compileMvEffect } from './mv/mv';
import { compilePwdEffect } from './pwd/pwd';
import { compileReadEffect } from './read/read';
import { compileRmEffect } from './rm/rm';
import { compileSetEffect } from './set/set';
import { compileSort } from './sort/sort';
import { compileStringEffect } from './string/string';
import { compileTailEffect } from './tail/tail';
import { compileBracketTestEffect, compileTestEffect } from './test/test';
import { compileTouchEffect } from './touch/touch';
import { compileTreeEffect } from './tree/tree';
import { compileFalseEffect, compileTrueEffect } from './true/true';
import { compileWcEffect } from './wc/wc';
import { compileXargsEffect } from './xargs/xargs';

/**
 * Handler function type for compiler.
 * Accepts a SimpleCommandIR and returns a StepIR.
 */
export type Handler = (cmd: SimpleCommandIR) => Result<StepIR, CompileError>;

/**
 * Registry of command handlers for the compiler.
 */
const handlers: Record<string, Handler> = {
	'[': compileBracketTestEffect,
	cat: compileCatEffect,
	cd: compileCdEffect,
	count: compileCountEffect,
	cp: compileCpEffect,
	echo: (cmd) => Result.ok(compileEcho(cmd)),
	false: compileFalseEffect,
	find: (cmd) => Result.ok(compileFind(cmd)),
	grep: (cmd) => Result.ok(compileGrep(cmd)),
	head: compileHeadEffect,
	ls: (cmd) => Result.ok(compileLs(cmd)),
	mkdir: compileMkdirEffect,
	mv: compileMvEffect,
	pwd: compilePwdEffect,
	read: compileReadEffect,
	rm: compileRmEffect,
	set: compileSetEffect,
	sort: (cmd) => Result.ok(compileSort(cmd)),
	string: compileStringEffect,
	tail: compileTailEffect,
	test: compileTestEffect,
	touch: compileTouchEffect,
	tree: compileTreeEffect,
	true: compileTrueEffect,
	wc: compileWcEffect,
	xargs: compileXargsEffect,
};

/**
 * Get a handler for a command name.
 * @throws CompileError if the command is unknown
 */
function get(name: string): Result<Handler, CompileError> {
	const handler = handlers[name];
	if (!handler) {
		return Result.err(
			new CompileError(
				createCommandDiagnostic(
					name,
					'unknown-command',
					`Unknown command: ${name}`
				)
			)
		);
	}
	return Result.ok(handler);
}

/**
 * Check if a handler exists for a command name.
 */
function has(name: string): boolean {
	return name in handlers;
}

/**
 * Register a custom handler.
 */
function register(name: string, handler: Handler): void {
	handlers[name] = handler;
}

export const CommandHandler = {
	get,
	has,
	register,
};
