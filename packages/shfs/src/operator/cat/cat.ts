import { Result } from 'better-result';

import { isDirectoryRecord } from '../../execute/records';
import type { FS } from '../../fs/fs';
import {
	byteRecordToLineRecords,
	type FileRecord,
	type LineRecord,
	type Record,
} from '../../record';
import type { Transducer } from '../types';

export interface CatOptions {
	numberLines?: boolean;
	numberNonBlank?: boolean;
	showAll?: boolean;
	showEnds?: boolean;
	showNonprinting?: boolean;
	showTabs?: boolean;
	squeezeBlank?: boolean;
}

const NEWLINE_BYTE = 0x0a;

function isLineRecord(record: Record): record is LineRecord {
	return record.kind === 'line';
}

function formatNonPrinting(text: string): string {
	let formatted = '';
	for (const char of text) {
		const code = char.charCodeAt(0);
		if (code === 9) {
			formatted += '\t';
			continue;
		}
		if (code < 32) {
			formatted += `^${String.fromCharCode(code + 64)}`;
			continue;
		}
		if (code === 127) {
			formatted += '^?';
			continue;
		}
		formatted += char;
	}
	return formatted;
}

function renderLineText(
	text: string,
	lineNumber: number | null,
	options: Required<CatOptions>
): string {
	let rendered = text;
	const showNonprinting = options.showAll || options.showNonprinting;
	const showTabs = options.showAll || options.showTabs;
	const showEnds = options.showAll || options.showEnds;

	if (showNonprinting) {
		rendered = formatNonPrinting(rendered);
	}
	if (showTabs) {
		rendered = rendered.replaceAll('\t', '^I');
	}
	if (showEnds) {
		rendered = `${rendered}$`;
	}
	if (lineNumber !== null) {
		rendered = `${lineNumber.toString().padStart(6, ' ')}\t${rendered}`;
	}

	return rendered;
}

function normalizeOptions(options?: CatOptions): Required<CatOptions> {
	return {
		numberLines: options?.numberLines ?? false,
		numberNonBlank: options?.numberNonBlank ?? false,
		showAll: options?.showAll ?? false,
		showEnds: options?.showEnds ?? false,
		showNonprinting: options?.showNonprinting ?? false,
		showTabs: options?.showTabs ?? false,
		squeezeBlank: options?.squeezeBlank ?? false,
	};
}

function transformsLines(options: Required<CatOptions>): boolean {
	return (
		options.numberLines ||
		options.numberNonBlank ||
		options.showAll ||
		options.showEnds ||
		options.showNonprinting ||
		options.showTabs ||
		options.squeezeBlank
	);
}

interface CatState {
	previousWasBlank: boolean;
	renderedLineNumber: number;
}

function nextRenderedLine(
	text: string,
	state: CatState,
	options: Required<CatOptions>
): { isSkipped: boolean; lineNumber: number | null; text: string } {
	const isBlank = text.length === 0;
	if (options.squeezeBlank && isBlank && state.previousWasBlank) {
		return { isSkipped: true, lineNumber: null, text };
	}
	state.previousWasBlank = isBlank;

	const shouldNumber = options.numberNonBlank
		? !isBlank
		: options.numberLines;
	const lineNumber = shouldNumber ? state.renderedLineNumber++ : null;
	return { isSkipped: false, lineNumber, text };
}

async function* emitLineRecord(
	record: LineRecord,
	state: CatState,
	options: Required<CatOptions>
): AsyncIterable<LineRecord> {
	const rendered = nextRenderedLine(record.text, state, options);
	if (rendered.isSkipped) {
		return;
	}

	yield {
		...record,
		text: renderLineText(rendered.text, rendered.lineNumber, options),
	};
}

async function* emitJsonRecord(
	value: unknown,
	state: CatState,
	options: Required<CatOptions>
): AsyncIterable<LineRecord> {
	const rendered = nextRenderedLine(JSON.stringify(value), state, options);
	if (rendered.isSkipped) {
		return;
	}

	yield {
		kind: 'line',
		text: renderLineText(rendered.text, rendered.lineNumber, options),
	};
}

async function* emitFileLines(
	fs: FS,
	record: FileRecord,
	state: CatState,
	options: Required<CatOptions>,
	onMissingFile?: (path: string) => void
): AsyncIterable<LineRecord> {
	if (onMissingFile) {
		const stat = await Result.tryPromise({
			try: () => fs.stat(record.path),
			catch: (error) => error,
		});
		if (Result.isError(stat)) {
			onMissingFile(record.path);
			return;
		}
	}
	if (await isDirectoryRecord(fs, record)) {
		return;
	}

	let pendingText: string | undefined;
	let sourceLineNum = 1;
	const emit = async function* (
		rawText: string,
		terminated: boolean
	): AsyncIterable<LineRecord> {
		const rendered = nextRenderedLine(rawText, state, options);
		if (rendered.isSkipped) {
			return;
		}

		const renderedRecord: LineRecord = {
			file: record.path,
			kind: 'line',
			lineNum: sourceLineNum++,
			text: renderLineText(rendered.text, rendered.lineNumber, options),
		};
		yield terminated
			? renderedRecord
			: { ...renderedRecord, terminated: false };
	};

	for await (const rawText of fs.readLines(record.path)) {
		if (pendingText !== undefined) {
			yield* emit(pendingText, true);
		}
		pendingText = rawText;
	}
	if (pendingText === undefined) {
		return;
	}

	// readLines intentionally drops the trailing empty sentinel, so the final
	// byte is the only way to distinguish a terminated last line.
	const content = await fs.readFile(record.path);
	const terminated = content.at(-1) === NEWLINE_BYTE;
	yield* emit(pendingText, terminated);
}

export function cat(
	fs: FS,
	options?: CatOptions,
	onMissingFile?: (path: string) => void
): Transducer<Record, Record> {
	const normalized = normalizeOptions(options);
	const state: CatState = {
		previousWasBlank: false,
		renderedLineNumber: 1,
	};

	return async function* (input) {
		for await (const record of input) {
			if (isLineRecord(record)) {
				yield* emitLineRecord(record, state, normalized);
				continue;
			}
			if (record.kind === 'bytes') {
				if (!transformsLines(normalized)) {
					yield record;
					continue;
				}
				for (const line of byteRecordToLineRecords(record)) {
					yield* emitLineRecord(line, state, normalized);
				}
				continue;
			}
			if (record.kind === 'json') {
				yield* emitJsonRecord(record.value, state, normalized);
				continue;
			}
			yield* emitFileLines(fs, record, state, normalized, onMissingFile);
		}
	};
}
