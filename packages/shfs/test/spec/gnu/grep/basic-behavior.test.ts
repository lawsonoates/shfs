// Translated/adapted from GNU grep tests:
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/status
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/options
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/file
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/empty
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/grep-dev-null
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/grep-dir
// - https://git.savannah.gnu.org/cgit/grep.git/tree/tests/help-version
// Copyright (C) 2000-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

import { Harness } from '@test/harness';

const harness = Harness.create();

async function expectStatus(
	command: string,
	expectedStatus: number,
	expectedOutput?: string
): Promise<void> {
	const { output, status } = await harness.runWithStatus(command);
	if (status !== expectedStatus) {
		throw new Error(
			`Expected status ${expectedStatus} but received ${status} for command: ${command}`
		);
	}
	if (expectedOutput !== undefined && output !== expectedOutput) {
		throw new Error(
			`Expected output ${JSON.stringify(expectedOutput)} but received ${JSON.stringify(output)} for command: ${command}`
		);
	}
}

test('gnu grep: status - GNU exit code contract (0 match, 1 no match, 2 error)', async () => {
	await expectStatus(
		`echo abcd | grep -E -e ${Harness.quote('abc')}`,
		0,
		'abcd'
	);
	await expectStatus(`echo abcd | grep -E -e ${Harness.quote('zbc')}`, 1);

	await expectStatus(`grep -E -e ${Harness.quote('abc')} MMMMMMMM.MMM`, 2);
	await expectStatus(`grep -E -s -e ${Harness.quote('abc')} MMMMMMMM.MMM`, 2);
	await expectStatus(
		`echo abcd | grep -E -s ${Harness.quote('abc')} - MMMMMMMM.MMM`,
		2,
		'abcd'
	);

	await expectStatus(
		`echo abcd | grep -E -q -s ${Harness.quote('abc')} MMMMMMMM.MMM -`,
		0
	);
	await expectStatus(
		`echo abcd | grep -E -q ${Harness.quote('abc')} MMMMMMMM.MMM -`,
		0
	);
});

test('gnu grep: options - -E, -G, -F preserve GNU matching behavior', async () => {
	await expectStatus(
		`echo abababccccccd | grep -E -e ${Harness.quote('c{3}')}`,
		0
	);
	await expectStatus(
		`echo abababccccccd | grep -G -e ${Harness.quote('c\\{3\\}')}`,
		0
	);
	await expectStatus(
		`echo abababccccccd | grep -F -e ${Harness.quote('c\\{3\\}')}`,
		1
	);
});

test('gnu grep: file - -f pattern files including empty and null pattern lists', async () => {
	await harness.setTextFile('/tmp/patfile', 'radar\nMILES\nGNU\n');

	await expectStatus('echo miles | grep -i -E -f /tmp/patfile', 0, 'miles');
	await expectStatus('echo GNU | grep -G -f /tmp/patfile', 0, 'GNU');
	await expectStatus('echo ridar | grep -F -f /tmp/patfile', 1);

	await harness.setTextFile('/tmp/patfile', '\n');
	await expectStatus('echo abbcd | grep -F -f /tmp/patfile', 0, 'abbcd');

	await harness.setTextFile('/tmp/patfile', '');
	await expectStatus('echo abbcd | grep -F -f /tmp/patfile', 1);
});

test('gnu grep: empty - empty -e pattern matches all while empty -f file matches none', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	for (const opt of ['-E', '-F']) {
		await expectStatus(`echo '' | grep ${opt} -e ''`, 0);
		await expectStatus(`echo abcd | grep ${opt} -f /dev/null`, 1);
		await expectStatus(`echo abcd | grep ${opt} -f /dev/null -e abcd`, 0);
		await expectStatus(`echo abcd | grep ${opt} -e ''`, 0, 'abcd');
	}

	for (const opt of [
		'-E -w',
		'-E -x',
		'-E -w -x',
		'-F -w',
		'-F -x',
		'-F -w -x',
	]) {
		await expectStatus(`echo '' | grep ${opt} -e ''`, 0);
		await expectStatus(`echo abcd | grep ${opt} -f /dev/null`, 1);
		await expectStatus(`echo abcd | grep ${opt} -f /dev/null -e ''`, 1);
	}
});

test('gnu grep: grep-dev-null - /dev/null as pattern file yields no patterns', async () => {
	await harness.ensureDir('/dev');
	await harness.setTextFile('/dev/null', '');

	for (const opt of [
		'-f /dev/null',
		'-if /dev/null',
		'-Ff /dev/null',
		'-Fif /dev/null',
	]) {
		await expectStatus(`echo x | grep ${opt}`, 1);
		await expectStatus(`grep ${opt} < /dev/null`, 1);
	}
});

test('gnu grep: grep-dir - directory passed to -f is an error', async () => {
	await harness.ensureDir('/tmp/a');

	for (const opt of [
		'-f /tmp/a/',
		'-if /tmp/a/',
		'-Ff /tmp/a/',
		'-Fif /tmp/a/',
	]) {
		await expectStatus(`echo x | grep ${opt}`, 2);
		await expectStatus(`grep ${opt} < /dev/null`, 2);
	}
});

test('gnu grep: help-version - grep advertises help and version successfully', async () => {
	const help = await harness.runWithStatus('grep --help');
	expect(help.status).toBe(0);
	expect(help.output.length).toBeGreaterThan(0);

	const version = await harness.runWithStatus('grep --version');
	expect(version.status).toBe(0);
	expect(version.output.toLowerCase()).toContain('grep');
});
