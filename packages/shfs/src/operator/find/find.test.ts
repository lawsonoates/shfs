import { beforeEach, expect, test } from 'bun:test';
import { dirname } from 'node:path';

import { MemoryFS } from '../../fs/memory';
import { Shell } from '../../shell/shell';

interface CommandResult {
	output: string;
	status: number;
}

let fs!: MemoryFS;
let shell!: Shell;

beforeEach(() => {
	fs = new MemoryFS();
	shell = new Shell(fs);
});

const runWithStatus = async (command: string): Promise<CommandResult> => {
	const result = await shell.$`${command}`.nothrow();
	return {
		output: result.text(),
		status: result.exitCode,
	};
};

const setTextFile = async (path: string, content: string): Promise<void> => {
	const parent = dirname(path);
	if (!(await fs.exists(parent))) {
		await fs.mkdir(parent, true);
	}
	fs.setFile(path, content);
};

const sortedLines = (text: string): string => {
	if (text === '') {
		return '';
	}
	return text.split('\n').sort().join('\n');
};

test('-wholename is an alias of -path', async () => {
	await fs.mkdir('/tmp/top/one/two', true);

	const pathResult = await runWithStatus(
		'find tmp/top -path tmp/top/one -print'
	);
	const wholeResult = await runWithStatus(
		'find tmp/top -wholename tmp/top/one -print'
	);

	expect(pathResult.status).toBe(0);
	expect(wholeResult.status).toBe(0);
	expect(wholeResult.output).toBe(pathResult.output);
});

test('-iwholename is an alias of -ipath', async () => {
	await fs.mkdir('/tmp/top/one/two', true);

	const ipathResult = await runWithStatus(
		'find tmp/top -ipath TmP/ToP/OnE -print'
	);
	const iwholeResult = await runWithStatus(
		'find tmp/top -iwholename TmP/ToP/OnE -print'
	);

	expect(ipathResult.status).toBe(0);
	expect(iwholeResult.status).toBe(0);
	expect(iwholeResult.output).toBe(ipathResult.output);
});

test('-iname is case-insensitive while -name remains case-sensitive', async () => {
	await fs.mkdir('/tmp/fred', true);

	const nameResult = await runWithStatus('find tmp -name FrEd -print');
	const inameResult = await runWithStatus('find tmp -iname FrEd -print');

	expect(nameResult.status).toBe(0);
	expect(nameResult.output).toBe('');
	expect(inameResult.status).toBe(0);
	expect(inameResult.output).toBe('tmp/fred');
});

test('-iname matches basenames, not full paths', async () => {
	await setTextFile('/tmp/dir/file.pdf', '');

	const result = await runWithStatus("find tmp -iname 'dir/file.pdf' -print");

	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

test('-true matches the same set as no predicate', async () => {
	await fs.mkdir('/tmp/fred/jim', true);
	await setTextFile('/tmp/fred/file.txt', 'content');

	const baseline = await runWithStatus('find tmp -depth');
	const withTrue = await runWithStatus('find tmp -depth -true');

	expect(baseline.status).toBe(0);
	expect(withTrue.status).toBe(0);
	expect(withTrue.output).toBe(baseline.output);
});

test('-false alone matches nothing and exits successfully', async () => {
	await fs.mkdir('/tmp/fred/jim', true);

	const result = await runWithStatus('find tmp -false');

	expect(result.status).toBe(0);
	expect(result.output).toBe('');
});

test('-false can be used with -o to select only the right branch', async () => {
	await fs.mkdir('/tmp/fred/jim', true);

	const result = await runWithStatus('find tmp -depth -false -o -name jim');

	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/fred/jim');
});

test('-empty matches only empty files and empty directories', async () => {
	await fs.mkdir('/tmp/empty-dir', true);
	await fs.mkdir('/tmp/nonempty-dir', true);
	await setTextFile('/tmp/empty-file', '');
	await setTextFile('/tmp/nonempty-file', 'x');
	await setTextFile('/tmp/nonempty-dir/child', 'x');

	const result = await runWithStatus('find tmp -empty');

	expect(result.status).toBe(0);
	expect(sortedLines(result.output)).toBe(
		['tmp/empty-dir', 'tmp/empty-file'].join('\n')
	);
});

test('-regex matches the whole display path, not a substring', async () => {
	await fs.mkdir('/tmp/d/d', true);

	const result = await runWithStatus("find tmp -regex 'tmp/d'");

	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/d');
});

test('-iregex is case-insensitive while -regex remains case-sensitive', async () => {
	await fs.mkdir('/tmp/d', true);

	const regexResult = await runWithStatus("find tmp -regex 'TMP/D'");
	const iregexResult = await runWithStatus("find tmp -iregex 'TMP/D'");

	expect(regexResult.status).toBe(0);
	expect(regexResult.output).toBe('');
	expect(iregexResult.status).toBe(0);
	expect(iregexResult.output).toBe('tmp/d');
});

test('-regex treats unescaped + as a literal under find default regex syntax', async () => {
	await setTextFile('/tmp/+', '');

	const literalPlus = await runWithStatus(
		"find tmp -maxdepth 1 -regex 'tmp/+'"
	);
	const lonePlus = await runWithStatus("find tmp -maxdepth 0 -regex '+'");

	expect(literalPlus.status).toBe(0);
	expect(literalPlus.output).toBe('tmp/+');
	expect(lonePlus.status).toBe(0);
	expect(lonePlus.output).toBe('');
});

test('-regex treats unescaped parentheses as literals under find default regex syntax', async () => {
	await setTextFile('/tmp/(x)', '');

	const result = await runWithStatus("find tmp -maxdepth 1 -regex 'tmp/(x)'");

	expect(result.status).toBe(0);
	expect(result.output).toBe('tmp/(x)');
});
