export interface StderrSink {
	stderr: string[];
}

export function appendStderrLines(
	context: StderrSink,
	lines: readonly string[]
): void {
	context.stderr.push(...lines);
}

export function formatStderr(lines: readonly string[]): string {
	return lines.join('\n');
}
