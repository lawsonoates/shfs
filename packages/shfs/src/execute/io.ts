import type { Record as ShellRecord } from '../record';
import { formatRecord } from '../record';
import type { OutputStream as DiagnosticOutputStream } from '../stderr';
import type { Stream } from '../stream';

const UTF8_ENCODER = new TextEncoder();
const NEWLINE = '\n';

export interface ShellInput {
	records(): Stream<ShellRecord>;
	lines(): Stream<string>;
	readLine(): Promise<string | null>;
	bytes(options?: { trailingNewline?: boolean }): Promise<Uint8Array>;
}

export interface ShellOutput {
	write(record: ShellRecord): void;
	writeLine(text: string): void;
	records(): readonly ShellRecord[];
}

export interface ShellIo {
	stdin: ShellInput;
	stdout: ShellOutput;
	stderr: DiagnosticOutputStream;
}

export class EmptyInput implements ShellInput {
	async *records(): Stream<ShellRecord> {
		// no records
	}

	async *lines(): Stream<string> {
		// no lines
	}

	async readLine(): Promise<string | null> {
		return null;
	}

	async bytes(): Promise<Uint8Array> {
		return new Uint8Array();
	}
}

export class RecordInput implements ShellInput {
	private readonly input: AsyncIterator<ShellRecord>;

	constructor(input: Stream<ShellRecord>) {
		this.input = input[Symbol.asyncIterator]();
	}

	async *records(): Stream<ShellRecord> {
		while (true) {
			const next = await this.input.next();
			if (next.done) {
				return;
			}
			yield next.value;
		}
	}

	async *lines(): Stream<string> {
		for await (const record of this.records()) {
			yield formatRecord(record);
		}
	}

	async readLine(): Promise<string | null> {
		const next = await this.input.next();
		return next.done ? null : formatRecord(next.value);
	}

	async bytes(
		options: { trailingNewline?: boolean } = {}
	): Promise<Uint8Array> {
		const lines: string[] = [];
		for await (const line of this.lines()) {
			lines.push(line);
		}
		if (lines.length === 0) {
			return new Uint8Array();
		}
		const text = options.trailingNewline
			? `${lines.join(NEWLINE)}${NEWLINE}`
			: lines.join(NEWLINE);
		return UTF8_ENCODER.encode(text);
	}
}

export class BufferedShellOutput implements ShellOutput {
	private readonly bufferedRecords: ShellRecord[] = [];

	write(record: ShellRecord): void {
		this.bufferedRecords.push(record);
	}

	writeLine(text: string): void {
		this.write({ kind: 'line', text });
	}

	records(): readonly ShellRecord[] {
		return [...this.bufferedRecords];
	}
}

export function createShellInput(
	input: Stream<ShellRecord> | null | undefined
): ShellInput {
	return input ? new RecordInput(input) : new EmptyInput();
}

export function recordsToShellInput(
	records: readonly ShellRecord[]
): ShellInput {
	return createShellInput(
		(async function* (): Stream<ShellRecord> {
			for (const record of records) {
				yield record;
			}
		})()
	);
}
