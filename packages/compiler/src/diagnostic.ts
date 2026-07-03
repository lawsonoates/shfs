import { TaggedError } from 'better-result';
import type { SourceSpan } from './lexer/position';

export type DiagnosticPhase = 'compile' | 'expansion' | 'parse' | 'runtime';
export type DiagnosticSeverity = 'error' | 'info' | 'warning';

export interface DiagnosticLocation {
	command?: string;
	path?: string;
	span?: SourceSpan;
	token?: string;
	tokenIndex?: number;
}

export interface ShellDiagnostic {
	code: string;
	location: DiagnosticLocation;
	message: string;
	phase: DiagnosticPhase;
	severity: DiagnosticSeverity;
}

export class CompileError extends TaggedError('CompileError')<{
	diagnostic: ShellDiagnostic;
	message: string;
}>() {
	constructor(diagnostic: ShellDiagnostic) {
		super({
			diagnostic,
			message: diagnostic.message,
		});
	}
}

export function isCompileError(error: unknown): error is CompileError {
	return (
		error instanceof CompileError ||
		(typeof error === 'object' &&
			error !== null &&
			'_tag' in error &&
			error._tag === 'CompileError')
	);
}

interface CreateDiagnosticOptions {
	code: string;
	location?: DiagnosticLocation;
	message: string;
	phase: DiagnosticPhase;
	severity?: DiagnosticSeverity;
}

export function createDiagnostic(
	options: CreateDiagnosticOptions
): ShellDiagnostic {
	return {
		code: options.code,
		location: { ...options.location },
		message: options.message,
		phase: options.phase,
		severity: options.severity ?? 'error',
	};
}

export function createParserDiagnostic(
	message: string,
	span: SourceSpan,
	options: {
		code?: string;
		severity?: DiagnosticSeverity;
	} = {}
): ShellDiagnostic {
	return createDiagnostic({
		code: options.code ?? 'syntax-error',
		location: { span },
		message,
		phase: 'parse',
		severity: options.severity,
	});
}

export function createCommandDiagnostic(
	command: string,
	code: string,
	message: string,
	options: {
		severity?: DiagnosticSeverity;
		token?: string;
		tokenIndex?: number;
	} = {}
): ShellDiagnostic {
	return createDiagnostic({
		code,
		location: {
			command,
			token: options.token,
			tokenIndex: options.tokenIndex,
		},
		message,
		phase: 'compile',
		severity: options.severity,
	});
}

export function createExpansionDiagnostic(
	command: string,
	code: string,
	message: string,
	options: {
		path?: string;
		severity?: DiagnosticSeverity;
	} = {}
): ShellDiagnostic {
	return createDiagnostic({
		code,
		location: {
			command,
			path: options.path,
		},
		message,
		phase: 'expansion',
		severity: options.severity,
	});
}

export function createRuntimeDiagnostic(
	command: string,
	code: string,
	message: string,
	options: {
		path?: string;
		severity?: DiagnosticSeverity;
		token?: string;
		tokenIndex?: number;
	} = {}
): ShellDiagnostic {
	return createDiagnostic({
		code,
		location: {
			command,
			path: options.path,
			token: options.token,
			tokenIndex: options.tokenIndex,
		},
		message,
		phase: 'runtime',
		severity: options.severity,
	});
}

export function hasErrorDiagnostics(
	diagnostics: readonly ShellDiagnostic[]
): boolean {
	return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
