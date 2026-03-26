import type { Buffer } from 'node:buffer';

import type { Record as StdoutRecord } from './record';

export interface OutputChannels<TStdout = StdoutRecord> {
	stdout: readonly TStdout[];
	stderr: readonly string[];
	exitCode: number;
}

export interface ShellOutputInit {
	exitCode: number;
	stderr: Buffer;
	stdout: Buffer;
}

export class ShellOutput {
	readonly exitCode: number;
	readonly stderr: Buffer;
	readonly stdout: Buffer;

	constructor(init: ShellOutputInit) {
		this.exitCode = init.exitCode;
		this.stderr = init.stderr;
		this.stdout = init.stdout;
	}

	arrayBuffer(): ArrayBuffer {
		return toArrayBuffer(this.stdout);
	}

	blob(): Blob {
		return new Blob([this.stdout]);
	}

	bytes(): Uint8Array {
		return new Uint8Array(this.stdout);
	}

	json(): unknown {
		return JSON.parse(this.text());
	}

	text(encoding: BufferEncoding = 'utf8'): string {
		return this.stdout.toString(encoding);
	}
}

export class ShellError extends Error {
	override cause?: unknown;
	readonly exitCode: number;
	readonly stderr: Buffer;
	readonly stdout: Buffer;

	constructor(output: ShellOutput, cause?: unknown) {
		const stderrText = output.stderr.toString('utf8');
		super(
			stderrText === ''
				? `Shell command failed with exit code ${output.exitCode}`
				: stderrText
		);
		this.name = 'ShellError';
		this.cause = cause;
		this.exitCode = output.exitCode;
		this.stdout = output.stdout;
		this.stderr = output.stderr;
	}
}

export type ExecuteOutput = OutputChannels;

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength
	) as ArrayBuffer;
}
