import type { LineRecord, Record as ShellRecord } from '../record';
import { recordsToBytes, toPhysicalLineRecords } from '../record';
import type { OutputStream as DiagnosticOutputStream } from '../stderr';
import type { Stream } from '../stream';

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
	private readonly lineInput: AsyncIterator<LineRecord>;

	constructor(input: Stream<ShellRecord>) {
		this.input = input[Symbol.asyncIterator]();
		const remainingInput: Stream<ShellRecord> = {
			[Symbol.asyncIterator]: () => this.input,
		};
		this.lineInput =
			toPhysicalLineRecords(remainingInput)[Symbol.asyncIterator]();
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
		while (true) {
			const line = await this.readLine();
			if (line === null) {
				return;
			}
			yield line;
		}
	}

	async readLine(): Promise<string | null> {
		const next = await this.lineInput.next();
		return next.done ? null : next.value.text;
	}

	async bytes(
		options: { trailingNewline?: boolean } = {}
	): Promise<Uint8Array> {
		const records: ShellRecord[] = [];
		for await (const record of this.records()) {
			records.push(record);
		}
		if (records.length === 0) {
			return new Uint8Array();
		}
		return recordsToBytes(records, options);
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
