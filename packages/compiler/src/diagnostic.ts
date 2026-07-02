import { Schema } from 'effect';
import { SourcePosition, SourceSpan } from './lexer/position';

export type DiagnosticPhase = 'compile' | 'expansion' | 'parse' | 'runtime';
export type DiagnosticSeverity = 'error' | 'info' | 'warning';

export const SourcePositionSchema = Schema.instanceOf(SourcePosition);

export const SourceSpanSchema = Schema.instanceOf(SourceSpan);

export const DiagnosticPhaseSchema = Schema.Literals([
	'compile',
	'expansion',
	'parse',
	'runtime',
]);

export const DiagnosticSeveritySchema = Schema.Literals([
	'error',
	'info',
	'warning',
]);

export const DiagnosticLocationSchema = Schema.Struct({
	command: Schema.optional(Schema.String),
	path: Schema.optional(Schema.String),
	span: Schema.optional(SourceSpanSchema),
	token: Schema.optional(Schema.String),
	tokenIndex: Schema.optional(Schema.Number),
});

export const ShellDiagnosticSchema = Schema.Struct({
	code: Schema.String,
	location: DiagnosticLocationSchema,
	message: Schema.String,
	phase: DiagnosticPhaseSchema,
	severity: DiagnosticSeveritySchema,
});

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

export class CompileError extends Schema.TaggedErrorClass<CompileError>()(
	'CompileError',
	{
		diagnostic: ShellDiagnosticSchema,
		message: Schema.String,
	}
) {
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
