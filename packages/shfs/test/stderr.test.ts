import { expect, test } from 'bun:test';

import { BufferedOutputStream, formatStderr } from '@/stderr';

function render(stream: BufferedOutputStream): string {
	return formatStderr(stream.snapshot());
}

test('exact stderr fragments preserve physical adjacency', () => {
	const unterminatedThenTerminated = new BufferedOutputStream();
	unterminatedThenTerminated.appendText('first');
	unterminatedThenTerminated.appendText('second\n');
	expect(render(unterminatedThenTerminated)).toBe('firstsecond\n');

	const terminatedThenTerminated = new BufferedOutputStream();
	terminatedThenTerminated.appendText('first\n');
	terminatedThenTerminated.appendText('second\n');
	expect(render(terminatedThenTerminated)).toBe('first\nsecond\n');

	const emptyBetweenFragments = new BufferedOutputStream();
	emptyBetweenFragments.appendText('first');
	emptyBetweenFragments.appendText('');
	emptyBetweenFragments.appendText('second');
	expect(render(emptyBetweenFragments)).toBe('firstsecond');
});

test('diagnostic stderr keeps logical line boundaries around exact fragments', () => {
	const diagnostics = new BufferedOutputStream();
	diagnostics.append('first');
	diagnostics.append('second');
	expect(render(diagnostics)).toBe('first\nsecond');

	const fragmentThenDiagnostic = new BufferedOutputStream();
	fragmentThenDiagnostic.appendText('prefix');
	fragmentThenDiagnostic.append('diagnostic');
	expect(render(fragmentThenDiagnostic)).toBe('prefixdiagnostic');

	const diagnosticThenFragment = new BufferedOutputStream();
	diagnosticThenFragment.append('diagnostic');
	diagnosticThenFragment.appendText('suffix');
	expect(render(diagnosticThenFragment)).toBe('diagnostic\nsuffix');
});
