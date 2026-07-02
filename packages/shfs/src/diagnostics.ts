import {
	type CompileError,
	type DiagnosticLocation,
	isCompileError,
	isParseSyntaxError,
	type ParseSyntaxError,
	type ShellDiagnostic,
	ShellDiagnosticSchema,
} from '@shfs/compiler';
import { Effect, Schema } from 'effect';

import { appendStderrLines, type StderrSink } from './stderr';

const FIRST_ARGUMENT_NUMBER = 1;

export class ShellDiagnosticError extends Schema.TaggedErrorClass<ShellDiagnosticError>()(
	'ShellDiagnosticError',
	{
		diagnostics: Schema.Array(ShellDiagnosticSchema),
		exitCode: Schema.Number,
		message: Schema.String,
	}
) {
	constructor(
		diagnostics: readonly ShellDiagnostic[],
		exitCode = exitCodeForDiagnostics(diagnostics)
	) {
		super({
			diagnostics,
			exitCode,
			message: diagnostics
				.map((diagnostic) => toErrorMessage(diagnostic))
				.join('\n'),
		});
	}

	get status(): number {
		return this.exitCode;
	}
}

export class ShellRuntimeError extends Schema.TaggedErrorClass<ShellRuntimeError>()(
	'ShellRuntimeError',
	{
		cause: Schema.optional(Schema.Defect()),
		exitCode: Schema.Number,
		message: Schema.String,
	}
) {}

export type ShellErrorCause = ShellDiagnosticError | ShellRuntimeError;

/**
 * Every typed failure the shell knows how to render as status + stderr.
 * This is the boundary contract between Effect error channels and the
 * shell's context-based reporting.
 */
export type ShellFailure = CompileError | ParseSyntaxError | ShellErrorCause;

export interface FailureContext extends StderrSink {
	status?: number;
}

export function isShellFailure(error: unknown): error is ShellFailure {
	return (
		isParseSyntaxError(error) ||
		isCompileError(error) ||
		isShellDiagnosticError(error) ||
		isShellRuntimeError(error)
	);
}

/**
 * Adapt a typed shell failure into exit status and stderr lines on the
 * execution context.
 */
export function reportShellFailure(
	context: FailureContext,
	failure: ShellFailure
): void {
	switch (failure._tag) {
		case 'ParseSyntaxError':
		case 'CompileError':
			context.status = 1;
			writeDiagnosticsToStderr(context, [failure.diagnostic]);
			return;
		case 'ShellDiagnosticError':
			context.status = failure.exitCode;
			writeDiagnosticsToStderr(context, failure.diagnostics);
			return;
		case 'ShellRuntimeError':
			context.status = failure.exitCode;
			if (failure.message !== '') {
				context.stderr.append(failure.message);
			}
			return;
		default: {
			const _exhaustive: never = failure;
			throw new Error(
				`Unknown shell failure: ${JSON.stringify(_exhaustive)}`
			);
		}
	}
}

/**
 * Run an effect at an async-generator (stream) boundary. Failures are
 * reported to the execution context instead of escaping as rejections.
 */
export async function runOrReport<T>(
	effect: Effect.Effect<T, ShellFailure>,
	context: FailureContext
): Promise<{ ok: false } | { ok: true; value: T }> {
	return Effect.runPromise(
		effect.pipe(
			Effect.match({
				onFailure: (failure) => {
					reportShellFailure(context, failure);
					return { ok: false } as const;
				},
				onSuccess: (value) => ({ ok: true, value }) as const,
			})
		)
	);
}

export function createDiagnosticError(
	diagnostics: readonly ShellDiagnostic[] | ShellDiagnostic,
	exitCode?: number
): ShellDiagnosticError {
	const normalizedDiagnostics = Array.isArray(diagnostics)
		? diagnostics
		: [diagnostics];
	return new ShellDiagnosticError(normalizedDiagnostics, exitCode);
}

export function formatDiagnostic(diagnostic: ShellDiagnostic): string {
	const prefix = `${diagnostic.severity}[${diagnostic.phase}:${diagnostic.code}]`;
	const location = formatLocation(diagnostic.location);
	return `${prefix}${location ? ` ${location}` : ''}: ${diagnostic.message}`;
}

export function formatDiagnostics(
	diagnostics: readonly ShellDiagnostic[]
): string[] {
	return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic));
}

export function writeDiagnosticsToStderr(
	context: StderrSink,
	diagnostics: readonly ShellDiagnostic[]
): void {
	appendStderrLines(context, formatDiagnostics(diagnostics));
}

export function isShellDiagnosticError(
	error: unknown
): error is ShellDiagnosticError {
	return (
		error instanceof ShellDiagnosticError ||
		(typeof error === 'object' &&
			error !== null &&
			'_tag' in error &&
			error._tag === 'ShellDiagnosticError')
	);
}

export function isShellRuntimeError(
	error: unknown
): error is ShellRuntimeError {
	return (
		error instanceof ShellRuntimeError ||
		(typeof error === 'object' &&
			error !== null &&
			'_tag' in error &&
			error._tag === 'ShellRuntimeError')
	);
}

export function exitCodeForDiagnostics(
	diagnostics: readonly ShellDiagnostic[]
): number {
	let exitCode = 0;
	for (const diagnostic of diagnostics) {
		if (diagnostic.severity !== 'error') {
			continue;
		}
		exitCode = Math.max(exitCode, exitCodeForDiagnostic(diagnostic));
	}
	return exitCode;
}

function formatLocation(location: DiagnosticLocation): string {
	const segments: string[] = [];
	if (location.command) {
		segments.push(location.command);
	}
	if (location.span) {
		segments.push(
			`${location.span.start.line}:${location.span.start.column}`
		);
	} else if (location.tokenIndex !== undefined) {
		segments.push(`arg ${location.tokenIndex + FIRST_ARGUMENT_NUMBER}`);
		if (location.token !== undefined) {
			segments.push(`("${location.token}")`);
		}
	}
	if (location.path) {
		segments.push(location.path);
	}
	return segments.join(' ');
}

function exitCodeForDiagnostic(diagnostic: ShellDiagnostic): number {
	if (
		diagnostic.phase === 'compile' &&
		diagnostic.location.command === 'grep'
	) {
		return 2;
	}
	return 1;
}

function toErrorMessage(diagnostic: ShellDiagnostic): string {
	const command = diagnostic.location.command;
	const path = diagnostic.location.path;

	if (command && path) {
		return `${command}: ${path}: ${diagnostic.message}`;
	}
	if (command) {
		return `${command}: ${diagnostic.message}`;
	}
	return diagnostic.message;
}
