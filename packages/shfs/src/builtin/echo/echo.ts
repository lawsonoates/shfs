import type { EchoStep } from '@shfs/compiler';
import { runOrReport } from '../../diagnostics';
import { evaluateExpandedPathWordsEffect } from '../../execute/path';
import type { LineRecord } from '../../record';
import type { Builtin } from '../types';

const HEX_REGEX = /^[\dA-Fa-f]$/;
const OCTAL_REGEX = /^[0-7]$/;
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
): { consumed: number; text: string } | null {
	const first = value[index] ?? '';
	if (first === 'x') {
		const head = value[index + 1] ?? '';
		if (!HEX_REGEX.test(head)) {
			return null;
		}
		const tail = value[index + 2] ?? '';
		const digits = HEX_REGEX.test(tail) ? `${head}${tail}` : head;
		return {
			consumed: digits.length + 1,
			text: String.fromCharCode(Number.parseInt(digits, 16)),
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
		consumed: digits.length,
		text: String.fromCharCode(Number.parseInt(digits, 8) % 256),
	};
}

function decode(value: string): { stopped: boolean; text: string } {
	let text = '';
	for (let index = 0; index < value.length; index++) {
		const char = value[index] ?? '';
		if (char !== '\\') {
			text += char;
			continue;
		}
		const next = value[index + 1];
		if (next === undefined) {
			return { stopped: false, text: `${text}\\` };
		}
		const escaped = ESCAPES[next];
		if (escaped !== undefined) {
			text += escaped;
			index++;
			continue;
		}
		if (next === 'c') {
			return { stopped: true, text };
		}
		const sequence = numeric(value, index + 1);
		if (sequence) {
			text += sequence.text;
			index += sequence.consumed;
			continue;
		}
		text += '\\';
	}
	return { stopped: false, text };
}

function toLineRecords(text: string, terminated: boolean): LineRecord[] {
	if (text === '' && !terminated) {
		return [];
	}
	const lines = text.split('\n');
	const endsWithDecodedNewline = text.endsWith('\n');
	if (!terminated && endsWithDecodedNewline) {
		lines.pop();
	}
	return lines.map((line, index) => {
		const isUnterminatedFinalLine =
			!(terminated || endsWithDecodedNewline) &&
			index === lines.length - 1;
		return isUnterminatedFinalLine
			? { kind: 'line', terminated: false, text: line }
			: { kind: 'line', text: line };
	});
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
		const output: string[] = [];
		let stopped = false;
		for (const value of values.value.slice(parsed.index)) {
			const decoded = parsed.opts.escapes
				? decode(value)
				: { stopped: false, text: value };
			output.push(decoded.text);
			if (decoded.stopped) {
				stopped = true;
				break;
			}
		}
		const text = output.join(parsed.opts.spaces ? ' ' : '');
		const terminated = parsed.opts.newline && !stopped;
		for (const record of toLineRecords(text, terminated)) {
			yield record;
		}
		runtime.context.status = 0;
	})();
};
