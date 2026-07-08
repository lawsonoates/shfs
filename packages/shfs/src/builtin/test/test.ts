import type { TestStep } from '@shfs/compiler';
import { evaluateExpandedWords, resolvePathFromCwd } from '../../execute/path';
import type { FS } from '../../fs/fs';
import type { Builtin, BuiltinRuntime } from '../types';

const INTEGER_REGEX = /^[+-]?\d+$/;
const FLOAT_REGEX = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)$/;
const LEADING_INTEGER_REGEX = /^([+-]?\d+)/;

const BINARY_STRING_OPERATORS = new Set(['=', '!=']);
const BINARY_NUMERIC_OPERATORS = new Set([
	'-eq',
	'-ne',
	'-gt',
	'-ge',
	'-lt',
	'-le',
]);
const BINARY_FILE_OPERATORS = new Set(['-nt', '-ot', '-ef']);
const UNARY_STRING_OPERATORS = new Set(['-n', '-z']);
const UNARY_FILE_OPERATORS = new Set(['-e', '-f', '-d', '-s']);

/**
 * A test expression error carrying the exact diagnostic message.
 */
class TestEvaluationError extends Error {}

function isBinaryOperator(token: string | undefined): boolean {
	return (
		token !== undefined &&
		(BINARY_STRING_OPERATORS.has(token) ||
			BINARY_NUMERIC_OPERATORS.has(token) ||
			BINARY_FILE_OPERATORS.has(token))
	);
}

function parseNumber(raw: string): number {
	const text = raw.trim();
	const lowered = text.toLowerCase();
	if (
		lowered === 'inf' ||
		lowered === '-inf' ||
		lowered === '+inf' ||
		lowered === 'infinity' ||
		lowered === '-infinity' ||
		lowered === '+infinity'
	) {
		throw new TestEvaluationError('Number is infinite');
	}
	if (lowered === 'nan' || lowered === '-nan' || lowered === '+nan') {
		throw new TestEvaluationError('Not a number');
	}
	if (INTEGER_REGEX.test(text) || FLOAT_REGEX.test(text)) {
		return Number(text);
	}
	const integerPrefix = LEADING_INTEGER_REGEX.exec(text);
	if (integerPrefix?.[1]) {
		throw new TestEvaluationError(
			`Integer ${integerPrefix[1]} in '${raw}' followed by non-digit`
		);
	}
	throw new TestEvaluationError(`Argument is not a number: '${raw}'`);
}

async function statOrNull(fs: FS, path: string) {
	try {
		return await fs.stat(path);
	} catch {
		return null;
	}
}

async function realPathOrNull(fs: FS, path: string): Promise<string | null> {
	try {
		return await fs.realPath(path);
	} catch {
		return null;
	}
}

/**
 * Recursive-descent evaluator for test expressions with fish's
 * `test-require-arg` semantics: missing operands are deterministic errors,
 * except bare -n/-z which treat the missing operand as an empty string.
 */
class TestExpressionEvaluator {
	private readonly tokens: readonly string[];
	private readonly fs: FS;
	private readonly cwd: string;
	private position = 0;

	constructor(tokens: readonly string[], fs: FS, cwd: string) {
		this.tokens = tokens;
		this.fs = fs;
		this.cwd = cwd;
	}

	async evaluate(): Promise<boolean> {
		const result = await this.parseOrExpression();
		if (this.position < this.tokens.length) {
			const leftover = this.tokens.length - this.position;
			if (leftover === 1) {
				throw new TestEvaluationError(
					`test: unexpected argument at index ${this.position + 1}: '${this.tokens[this.position]}'`
				);
			}
			throw new TestEvaluationError(
				`test: Expected a combining operator like '-a' at index ${this.position + 1}`
			);
		}
		return result;
	}

	private async parseOrExpression(): Promise<boolean> {
		let result = await this.parseAndExpression();
		while (this.tokens[this.position] === '-o') {
			this.position++;
			const right = await this.parseAndExpression();
			result = result || right;
		}
		return result;
	}

	private async parseAndExpression(): Promise<boolean> {
		let result = await this.parseUnaryExpression();
		while (this.tokens[this.position] === '-a') {
			this.position++;
			const right = await this.parseUnaryExpression();
			result = result && right;
		}
		return result;
	}

	private async parseUnaryExpression(): Promise<boolean> {
		if (this.tokens[this.position] === '!') {
			this.position++;
			return !(await this.parseUnaryExpression());
		}
		return await this.parsePrimary();
	}

	private missingArgument(): never {
		throw new TestEvaluationError(
			`test: Missing argument at index ${this.position + 1}`
		);
	}

	private async parsePrimary(): Promise<boolean> {
		const token = this.tokens[this.position];
		if (token === undefined) {
			this.missingArgument();
		}

		if (UNARY_STRING_OPERATORS.has(token)) {
			this.position++;
			const operand = this.takeOptionalOperand() ?? '';
			return token === '-n' ? operand !== '' : operand === '';
		}

		if (UNARY_FILE_OPERATORS.has(token)) {
			this.position++;
			const operand = this.takeOperand();
			return await this.evaluateFilePredicate(token, operand);
		}

		// token OPERATOR token
		const operator = this.tokens[this.position + 1];
		if (isBinaryOperator(operator) && operator !== undefined) {
			const left = token;
			this.position += 2;
			const right = this.tokens[this.position];
			if (right === undefined) {
				this.missingArgument();
			}
			this.position++;
			return await this.evaluateBinary(left, operator, right);
		}

		// A bare operand needs a following operator (test-require-arg).
		this.position++;
		this.missingArgument();
	}

	private takeOperand(): string {
		const operand = this.tokens[this.position];
		if (operand === undefined) {
			this.missingArgument();
		}
		this.position++;
		return operand;
	}

	private takeOptionalOperand(): string | null {
		const operand = this.tokens[this.position];
		if (operand === undefined) {
			return null;
		}
		this.position++;
		return operand;
	}

	private async evaluateBinary(
		left: string,
		operator: string,
		right: string
	): Promise<boolean> {
		if (operator === '=') {
			return left === right;
		}
		if (operator === '!=') {
			return left !== right;
		}
		if (BINARY_NUMERIC_OPERATORS.has(operator)) {
			const leftNumber = parseNumber(left);
			const rightNumber = parseNumber(right);
			switch (operator) {
				case '-eq':
					return leftNumber === rightNumber;
				case '-ne':
					return leftNumber !== rightNumber;
				case '-gt':
					return leftNumber > rightNumber;
				case '-ge':
					return leftNumber >= rightNumber;
				case '-lt':
					return leftNumber < rightNumber;
				default:
					return leftNumber <= rightNumber;
			}
		}
		return await this.evaluateFileComparison(left, operator, right);
	}

	private async evaluateFileComparison(
		left: string,
		operator: string,
		right: string
	): Promise<boolean> {
		const leftPath = resolvePathFromCwd(this.cwd, left);
		const rightPath = resolvePathFromCwd(this.cwd, right);
		if (operator === '-ef') {
			const leftReal = await realPathOrNull(this.fs, leftPath);
			const rightReal = await realPathOrNull(this.fs, rightPath);
			return (
				leftReal !== null &&
				rightReal !== null &&
				leftReal === rightReal
			);
		}
		const leftStat = await statOrNull(this.fs, leftPath);
		const rightStat = await statOrNull(this.fs, rightPath);
		if (operator === '-nt') {
			if (!leftStat) {
				return false;
			}
			return (
				!rightStat ||
				leftStat.mtime.getTime() > rightStat.mtime.getTime()
			);
		}
		// -ot
		if (!rightStat) {
			return false;
		}
		return (
			!leftStat || leftStat.mtime.getTime() < rightStat.mtime.getTime()
		);
	}

	private async evaluateFilePredicate(
		operator: string,
		operand: string
	): Promise<boolean> {
		const path = resolvePathFromCwd(this.cwd, operand);
		const stat = await statOrNull(this.fs, path);
		if (!stat) {
			return false;
		}
		switch (operator) {
			case '-e':
				return true;
			case '-f':
				return stat.type === 'File';
			case '-d':
				return stat.type === 'Directory';
			default:
				// -s
				return stat.size > 0;
		}
	}
}

function reportTestError(runtime: BuiltinRuntime, message: string): void {
	runtime.context.stderr.append(message);
	runtime.context.status = 1;
}

async function runTestCommand(
	runtime: BuiltinRuntime,
	args: TestStep['args']
): Promise<void> {
	let operands = await evaluateExpandedWords(
		args.operands,
		runtime.fs,
		runtime.context
	);

	if (args.bracket) {
		if (operands.at(-1) !== ']') {
			reportTestError(runtime, "[: the last argument must be ']'");
			return;
		}
		operands = operands.slice(0, -1);
	}

	if (operands.length === 0) {
		reportTestError(runtime, 'test: Expected at least one argument');
		return;
	}

	try {
		const evaluator = new TestExpressionEvaluator(
			operands,
			runtime.fs,
			runtime.context.cwd
		);
		runtime.context.status = (await evaluator.evaluate()) ? 0 : 1;
	} catch (error) {
		if (error instanceof TestEvaluationError) {
			reportTestError(runtime, error.message);
			return;
		}
		throw error;
	}
}

export const test: Builtin<TestStep['args']> = (runtime, args) => {
	return (async function* () {
		await runTestCommand(runtime, args);
		yield* [];
	})();
};
