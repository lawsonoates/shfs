import type { Record as ShellRecord } from '../record';
import { formatRecord, recordsToBytes } from '../record';
import type { OutputStream as DiagnosticOutputStream } from '../stderr';
import type { Stream } from '../stream';

const NEWLINE_BYTE = 0x0a;

interface LineReadState {
	decodingBytes: boolean;
	readonly decoder: TextDecoder;
	hasPendingLine: boolean;
	text: string;
}

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
	private readonly pendingRecords: ShellRecord[] = [];

	constructor(input: Stream<ShellRecord>) {
		this.input = input[Symbol.asyncIterator]();
	}

	async *records(): Stream<ShellRecord> {
		while (true) {
			const record = await this.takeRecord();
			if (record === null) {
				return;
			}
			yield record;
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
		const state: LineReadState = {
			decoder: new TextDecoder(),
			decodingBytes: false,
			hasPendingLine: false,
			text: '',
		};

		while (true) {
			const record = await this.takeRecord();
			if (record === null) {
				return this.finishLine(state);
			}
			const line = this.consumeRecord(state, record);
			if (line !== undefined) {
				return line;
			}
		}
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

	private appendDecoded(state: LineReadState, text: string): void {
		state.text += text;
		state.hasPendingLine ||= text.length > 0;
	}

	private consumeByteRecord(
		state: LineReadState,
		bytes: Uint8Array
	): string | undefined {
		state.decodingBytes = true;
		const newlineIndex = bytes.indexOf(NEWLINE_BYTE);
		if (newlineIndex === -1) {
			this.appendDecoded(
				state,
				state.decoder.decode(bytes, { stream: true })
			);
			return undefined;
		}

		this.appendDecoded(
			state,
			state.decoder.decode(bytes.subarray(0, newlineIndex), {
				stream: true,
			})
		);
		this.appendDecoded(state, state.decoder.decode());
		this.prependByteSuffix(bytes, newlineIndex + 1);
		return state.text;
	}

	private consumeExplicitRecord(
		state: LineReadState,
		record: Extract<ShellRecord, { kind: 'line' }>
	): string {
		if (state.hasPendingLine) {
			this.pendingRecords.unshift(record);
			return state.text;
		}
		return record.text;
	}

	private consumeRecord(
		state: LineReadState,
		record: ShellRecord
	): string | undefined {
		if (record.kind === 'bytes') {
			return this.consumeByteRecord(state, record.bytes);
		}

		this.flushByteDecoder(state);
		if (record.kind === 'line' && record.separation === 'explicit') {
			return this.consumeExplicitRecord(state, record);
		}
		return this.consumeTextRecord(state, record);
	}

	private consumeTextRecord(
		state: LineReadState,
		record: Exclude<ShellRecord, { kind: 'bytes' }>
	): string | undefined {
		const text =
			record.kind === 'line' ? record.text : formatRecord(record);
		const newlineIndex = text.indexOf('\n');
		if (newlineIndex !== -1) {
			state.text += text.slice(0, newlineIndex);
			this.prependTextSuffix(record, text.slice(newlineIndex + 1));
			return state.text;
		}

		state.text += text;
		state.hasPendingLine ||= text.length > 0;
		return record.kind !== 'line' || record.terminated !== false
			? state.text
			: undefined;
	}

	private finishLine(state: LineReadState): string | null {
		this.flushByteDecoder(state);
		return state.hasPendingLine ? state.text : null;
	}

	private flushByteDecoder(state: LineReadState): void {
		if (!state.decodingBytes) {
			return;
		}
		this.appendDecoded(state, state.decoder.decode());
		state.decodingBytes = false;
	}

	private prependByteSuffix(bytes: Uint8Array, start: number): void {
		if (start >= bytes.length) {
			return;
		}
		this.pendingRecords.unshift({
			bytes: bytes.slice(start),
			kind: 'bytes',
		});
	}

	private prependTextSuffix(record: ShellRecord, text: string): void {
		if (record.kind === 'line') {
			if (text === '' && record.terminated === false) {
				return;
			}
			this.pendingRecords.unshift({ ...record, text });
			return;
		}
		this.pendingRecords.unshift({ kind: 'line', text });
	}

	private async takeRecord(): Promise<ShellRecord | null> {
		const pending = this.pendingRecords.shift();
		if (pending) {
			return pending;
		}
		const next = await this.input.next();
		return next.done ? null : next.value;
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
