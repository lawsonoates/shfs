import type { LineRecord, Record as ShellRecord } from '../record';
import { formatRecord, recordsToBytes } from '../record';
import type { OutputStream as DiagnosticOutputStream } from '../stderr';
import type { Stream } from '../stream';

const NEWLINE_BYTE = 0x0a;

interface LineReadState {
	decodingBytes: boolean;
	readonly decoder: TextDecoder;
	hasPendingLine: boolean;
	template?: LineRecord;
	text: string;
}

interface PhysicalRecordSelection {
	emitted: ShellRecord;
	lineCount: number;
	unread?: ShellRecord;
}

function toPhysicalRecord(record: ShellRecord): ShellRecord {
	if (record.kind === 'bytes' || record.kind === 'line') {
		return record;
	}
	return { kind: 'line', text: formatRecord(record) };
}

function selectPhysicalRecord(
	record: ShellRecord,
	lineLimit: number
): PhysicalRecordSelection {
	const physicalRecord = toPhysicalRecord(record);
	const bytes = recordsToBytes([physicalRecord], { trailingNewline: true });
	let lineCount = 0;
	for (const [index, byte] of bytes.entries()) {
		if (byte !== NEWLINE_BYTE) {
			continue;
		}
		lineCount++;
		if (lineCount !== lineLimit) {
			continue;
		}
		const splitIndex = index + 1;
		if (splitIndex === bytes.length) {
			return { emitted: physicalRecord, lineCount };
		}
		return {
			emitted: {
				bytes: bytes.slice(0, splitIndex),
				kind: 'bytes',
			},
			lineCount,
			unread: {
				bytes: bytes.slice(splitIndex),
				kind: 'bytes',
			},
		};
	}
	return { emitted: physicalRecord, lineCount };
}

export interface ShellInput {
	records(): Stream<ShellRecord>;
	takePhysicalLines(count: number): Stream<ShellRecord>;
	lineRecords(): Stream<LineRecord>;
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

	async *takePhysicalLines(_count: number): Stream<ShellRecord> {
		// no records
	}

	async *lines(): Stream<string> {
		// no lines
	}

	async *lineRecords(): Stream<LineRecord> {
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

	async *takePhysicalLines(count: number): Stream<ShellRecord> {
		let remainingLines = count;
		while (remainingLines > 0) {
			const record = await this.takeRecord();
			if (record === null) {
				return;
			}
			const selected = selectPhysicalRecord(record, remainingLines);
			remainingLines -= selected.lineCount;
			if (remainingLines === 0 && selected.unread) {
				this.pendingRecords.unshift(selected.unread);
			}
			yield selected.emitted;
			if (remainingLines === 0) {
				return;
			}
		}
	}

	async *lines(): Stream<string> {
		for await (const line of this.lineRecords()) {
			yield line.text;
		}
	}

	async *lineRecords(): Stream<LineRecord> {
		while (true) {
			const line = await this.readLineRecord();
			if (line === null) {
				return;
			}
			yield line;
		}
	}

	async readLine(): Promise<string | null> {
		return (await this.readLineRecord())?.text ?? null;
	}

	private async readLineRecord(): Promise<LineRecord | null> {
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
		this.appendLineText(state, text);
	}

	private appendLineText(
		state: LineReadState,
		text: string,
		template?: LineRecord
	): void {
		if (!state.hasPendingLine && text.length > 0 && template) {
			state.template = template;
		}
		state.text += text;
		state.hasPendingLine ||= text.length > 0;
	}

	private consumeByteRecord(
		state: LineReadState,
		bytes: Uint8Array
	): LineRecord | undefined {
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
		return this.toLineRecord(state, true);
	}

	private consumeExplicitRecord(
		state: LineReadState,
		record: LineRecord
	): LineRecord {
		if (state.hasPendingLine) {
			this.pendingRecords.unshift(record);
			return this.toLineRecord(state, false);
		}
		return record;
	}

	private consumeRecord(
		state: LineReadState,
		record: ShellRecord
	): LineRecord | undefined {
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
	): LineRecord | undefined {
		const text =
			record.kind === 'line' ? record.text : formatRecord(record);
		const template = record.kind === 'line' ? record : undefined;
		const fallback = state.hasPendingLine ? undefined : template;
		const newlineIndex = text.indexOf('\n');
		if (newlineIndex !== -1) {
			this.appendLineText(state, text.slice(0, newlineIndex), template);
			this.prependTextSuffix(record, text.slice(newlineIndex + 1));
			return this.toLineRecord(state, true, fallback);
		}

		this.appendLineText(state, text, template);
		return record.kind !== 'line' || record.terminated !== false
			? this.toLineRecord(state, true, fallback)
			: undefined;
	}

	private finishLine(state: LineReadState): LineRecord | null {
		this.flushByteDecoder(state);
		return state.hasPendingLine ? this.toLineRecord(state, false) : null;
	}

	private flushByteDecoder(state: LineReadState): void {
		if (!state.decodingBytes) {
			return;
		}
		this.appendDecoded(state, state.decoder.decode());
		state.decodingBytes = false;
	}

	private toLineRecord(
		state: LineReadState,
		terminated: boolean,
		fallback?: LineRecord
	): LineRecord {
		const line: LineRecord = {
			...(state.template ?? fallback ?? { kind: 'line' as const }),
			text: state.text,
		};
		if (!terminated) {
			return { ...line, terminated: false };
		}
		line.terminated = undefined;
		return line;
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
