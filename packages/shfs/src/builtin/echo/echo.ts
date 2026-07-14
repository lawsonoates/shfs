import type { EchoStep } from '@shfs/compiler';
import { runOrReport } from '../../diagnostics';
import { evaluateExpandedPathWordsEffect } from '../../execute/path';
import { textToLineRecords } from '../../stdout-record';
import type { Builtin } from '../types';

const HEX_REGEX = /^[\dA-Fa-f]$/;
const OCTAL_REGEX = /^[0-7]$/;
const UTF8_ENCODER = new TextEncoder();
const ESCAPES: Readonly<Record<string, string>> = {
	a: '\x07',
	b: '\b',
	e: '\x1b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
	'\\': '\\',
};

type EchoPart =
	| { kind: 'byte'; value: number }
	| { kind: 'text'; value: string };

function appendText(parts: EchoPart[], value: string): void {
	const previous = parts.at(-1);
	if (previous?.kind === 'text') {
		previous.value += value;
		return;
	}
	parts.push({ kind: 'text', value });
}

function parse(values: readonly string[]) {
	const opts = {
		escapes: false,
		newline: true,
		spaces: true,
	};
	let index = 0;
	for (const value of values) {
		if (value === '--') {
			return { index: index + 1, opts };
		}
		if (value === '-' || !value.startsWith('-')) {
			return { index, opts };
		}
		const next = { ...opts };
		for (const flag of value.slice(1)) {
			switch (flag) {
				case 'n':
					next.newline = false;
					break;
				case 's':
					next.spaces = false;
					break;
				case 'e':
					next.escapes = true;
					break;
				case 'E':
					next.escapes = false;
					break;
				default:
					return { index, opts };
			}
		}
		Object.assign(opts, next);
		index++;
	}
	return { index, opts };
}

function numeric(
	value: string,
	index: number
): { byte: number; consumed: number } | null {
	const first = value[index] ?? '';
	if (first === 'x') {
		const head = value[index + 1] ?? '';
		if (!HEX_REGEX.test(head)) {
			return null;
		}
		const tail = value[index + 2] ?? '';
		const digits = HEX_REGEX.test(tail) ? `${head}${tail}` : head;
		return {
			byte: Number.parseInt(digits, 16),
			consumed: digits.length + 1,
		};
	}
	if (!OCTAL_REGEX.test(first)) {
		return null;
	}
	const limit = first === '0' ? 4 : 3;
	let digits = '';
	for (const digit of value.slice(index, index + limit)) {
		if (!OCTAL_REGEX.test(digit)) {
			break;
		}
		digits += digit;
	}
	return {
		byte: Number.parseInt(digits, 8) % 256,
		consumed: digits.length,
	};
}

function decode(value: string): { parts: EchoPart[]; stopped: boolean } {
	const parts: EchoPart[] = [];
	for (let index = 0; index < value.length; index++) {
		const char = value[index] ?? '';
		if (char !== '\\') {
			appendText(parts, char);
			continue;
		}
		const next = value[index + 1];
		if (next === undefined) {
			appendText(parts, '\\');
			return { parts, stopped: false };
		}
		const escaped = ESCAPES[next];
		if (escaped !== undefined) {
			appendText(parts, escaped);
			index++;
			continue;
		}
		if (next === 'c') {
			return { parts, stopped: true };
		}
		const sequence = numeric(value, index + 1);
		if (sequence) {
			parts.push({ kind: 'byte', value: sequence.byte });
			index += sequence.consumed;
			continue;
		}
		appendText(parts, '\\');
	}
	return { parts, stopped: false };
}

function encodeParts(parts: readonly EchoPart[]): Uint8Array {
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (const part of parts) {
		const chunk =
			part.kind === 'byte'
				? new Uint8Array([part.value])
				: UTF8_ENCODER.encode(part.value);
		chunks.push(chunk);
		length += chunk.length;
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}

function buildOutput(
	values: readonly string[],
	parsed: ReturnType<typeof parse>
): { hasRawByte: boolean; parts: EchoPart[]; stopped: boolean } {
	const parts: EchoPart[] = [];
	let hasRawByte = false;
	let stopped = false;
	for (const [index, value] of values.slice(parsed.index).entries()) {
		if (index > 0 && parsed.opts.spaces) {
			appendText(parts, ' ');
		}
		const decoded = parsed.opts.escapes
			? decode(value)
			: {
					parts: [{ kind: 'text', value }] satisfies EchoPart[],
					stopped: false,
				};
		parts.push(...decoded.parts);
		if (decoded.parts.some((part) => part.kind === 'byte')) {
			hasRawByte = true;
		}
		if (decoded.stopped) {
			stopped = true;
			break;
		}
	}
	return { hasRawByte, parts, stopped };
}

export const echo: Builtin<EchoStep['args']> = (runtime, args) => {
	return (async function* () {
		const values = await runOrReport(
			evaluateExpandedPathWordsEffect(
				'echo',
				args.values,
				runtime.fs,
				runtime.context
			),
			runtime.context
		);
		if (!values.ok) {
			return;
		}
		const parsed = parse(values.value);
		const output = buildOutput(values.value, parsed);
		const terminated = parsed.opts.newline && !output.stopped;
		if (output.hasRawByte) {
			if (terminated) {
				appendText(output.parts, '\n');
			}
			yield {
				bytes: encodeParts(output.parts),
				kind: 'bytes',
			} as const;
			runtime.context.status = 0;
			return;
		}
		const text = output.parts
			.map((part) => (part.kind === 'text' ? part.value : ''))
			.join('');
		for (const record of textToLineRecords(text, terminated)) {
			yield record;
		}
		runtime.context.status = 0;
	})();
};
