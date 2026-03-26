import type { DiagnosticLocation, ShellDiagnostic } from '@shfs/compiler';

import type { LineRecord } from './record';

const FIRST_ARGUMENT_NUMBER = 1;

export class ShellDiagnosticError extends Error {
	readonly diagnostics: readonly ShellDiagnostic[];
	readonly status: number;

	constructor(
		diagnostics: readonly ShellDiagnostic[],
		status = statusForDiagnostics(diagnostics)
	) {
		super(
			diagnostics
				.map((diagnostic) => toErrorMessage(diagnostic))
				.join('\n')
		);
		this.name = 'ShellDiagnosticError';
		this.diagnostics = diagnostics;
		this.status = status;
	}
}

export function createDiagnosticError(
	diagnostics: readonly ShellDiagnostic[] | ShellDiagnostic,
	status?: number
): ShellDiagnosticError {
	const normalizedDiagnostics = Array.isArray(diagnostics)
		? diagnostics
		: [diagnostics];
	return new ShellDiagnosticError(normalizedDiagnostics, status);
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

export function diagnosticsToLineRecords(
	diagnostics: readonly ShellDiagnostic[]
): LineRecord[] {
	return formatDiagnostics(diagnostics).map((text) => ({
		kind: 'line',
		text,
	}));
}

export function isShellDiagnosticError(
	error: unknown
): error is ShellDiagnosticError {
	return error instanceof ShellDiagnosticError;
}

export function statusForDiagnostics(
	diagnostics: readonly ShellDiagnostic[]
): number {
	let status = 0;
	for (const diagnostic of diagnostics) {
		if (diagnostic.severity !== 'error') {
			continue;
		}
		status = Math.max(status, statusForDiagnostic(diagnostic));
	}
	return status;
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

function statusForDiagnostic(diagnostic: ShellDiagnostic): number {
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
