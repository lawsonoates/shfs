/**
 * Error reporter for the Fish subset parser.
 *
 * Collects errors and warnings during parsing for reporting to the user.
 */

import type { SourceSpan } from '../lexer/position';

/**
 * Severity level for diagnostic messages.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A diagnostic message with position and severity.
 */
export interface Diagnostic {
	readonly severity: DiagnosticSeverity;
	readonly message: string;
	readonly span: SourceSpan;
	readonly code?: string;
}

/**
 * Error reporter for collecting parser diagnostics.
 *
 * Supports both immediate error throwing and error collection modes.
 */
export class ErrorReporter {
	private readonly diagnostics: Diagnostic[] = [];
	private errorCount = 0;
	private warningCount = 0;

	/**
	 * Report an error.
	 */
	reportError(message: string, span: SourceSpan, code?: string): void {
		this.diagnostics.push({
			severity: 'error',
			message,
			span,
			code,
		});
		this.errorCount++;
	}

	/**
	 * Report a warning.
	 */
	reportWarning(message: string, span: SourceSpan, code?: string): void {
		this.diagnostics.push({
			severity: 'warning',
			message,
			span,
			code,
		});
		this.warningCount++;
	}

	/**
	 * Report an informational message.
	 */
	reportInfo(message: string, span: SourceSpan, code?: string): void {
		this.diagnostics.push({
			severity: 'info',
			message,
			span,
			code,
		});
	}

	/**
	 * Check if any errors have been reported.
	 */
	hasErrors(): boolean {
		return this.errorCount > 0;
	}

	/**
	 * Check if any warnings have been reported.
	 */
	hasWarnings(): boolean {
		return this.warningCount > 0;
	}

	/**
	 * Get the number of errors.
	 */
	getErrorCount(): number {
		return this.errorCount;
	}

	/**
	 * Get the number of warnings.
	 */
	getWarningCount(): number {
		return this.warningCount;
	}

	/**
	 * Get all diagnostics.
	 */
	getDiagnostics(): readonly Diagnostic[] {
		return this.diagnostics;
	}

	/**
	 * Get only error diagnostics.
	 */
	getErrors(): Diagnostic[] {
		return this.diagnostics.filter((d) => d.severity === 'error');
	}

	/**
	 * Get only warning diagnostics.
	 */
	getWarnings(): Diagnostic[] {
		return this.diagnostics.filter((d) => d.severity === 'warning');
	}

	/**
	 * Clear all diagnostics.
	 */
	clear(): void {
		this.diagnostics.length = 0;
		this.errorCount = 0;
		this.warningCount = 0;
	}

	/**
	 * Format all diagnostics as a string for display.
	 */
	format(): string {
		return this.diagnostics
			.map((d) => {
				const loc = `${d.span.start.line}:${d.span.start.column}`;
				let prefix: string;
				if (d.severity === 'error') {
					prefix = 'Error';
				} else if (d.severity === 'warning') {
					prefix = 'Warning';
				} else {
					prefix = 'Info';
				}
				const code = d.code ? ` [${d.code}]` : '';
				return `${prefix}${code} at ${loc}: ${d.message}`;
			})
			.join('\n');
	}
}
