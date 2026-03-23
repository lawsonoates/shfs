import { isDirectoryRecord } from '../../execute/records';
import type { FS } from '../../fs/fs';
import type { FileRecord, LineRecord, Record } from '../../record';
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
	options: Required<CatOptions>
): AsyncIterable<LineRecord> {
	if (await isDirectoryRecord(fs, record)) {
		return;
	}

	let sourceLineNum = 1;
	for await (const rawText of fs.readLines(record.path)) {
		const rendered = nextRenderedLine(rawText, state, options);
		if (rendered.isSkipped) {
			continue;
		}

		yield {
			file: record.path,
			kind: 'line',
			lineNum: sourceLineNum++,
			text: renderLineText(rendered.text, rendered.lineNumber, options),
		};
	}
}

export function cat(
	fs: FS,
	options?: CatOptions
): Transducer<Record, LineRecord> {
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
			if (record.kind === 'json') {
				yield* emitJsonRecord(record.value, state, normalized);
				continue;
			}
			yield* emitFileLines(fs, record, state, normalized);
		}
	};
}
