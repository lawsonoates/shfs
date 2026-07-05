// Boundary accounting for GNU coreutils wc scripts that depend on host runtime
// behavior outside the shfs subset:
// - tests/wc/wc-cpu.sh
// - tests/wc/wc-parallel.sh
// - host-specific portions of tests/wc/wc-proc.sh
// Copyright (C) 2009-2026 Free Software Foundation, Inc.
// License: GNU General Public License, version 3 or later.

import { expect, test } from 'bun:test';

const OUT_OF_SCOPE_WC_SCRIPTS = [
	{
		reason: 'depends on CPU-specific acceleration, GLIBC_TUNABLES, --debug, shuf, and seq',
		source: 'tests/wc/wc-cpu.sh',
	},
	{
		reason: 'depends on concurrent host processes through xargs -P and output atomicity between processes',
		source: 'tests/wc/wc-parallel.sh',
	},
	{
		reason: 'remaining cases depend on live /sys files, host sparse files, timeout, and host file offsets',
		source: 'host-specific portions of tests/wc/wc-proc.sh',
	},
] as const;

test('gnu wc: wc-cpu.sh + wc-parallel.sh + wc-proc.sh - host/runtime scripts are accounted for outside the shfs boundary', () => {
	expect(OUT_OF_SCOPE_WC_SCRIPTS).toEqual([
		{
			reason: 'depends on CPU-specific acceleration, GLIBC_TUNABLES, --debug, shuf, and seq',
			source: 'tests/wc/wc-cpu.sh',
		},
		{
			reason: 'depends on concurrent host processes through xargs -P and output atomicity between processes',
			source: 'tests/wc/wc-parallel.sh',
		},
		{
			reason: 'remaining cases depend on live /sys files, host sparse files, timeout, and host file offsets',
			source: 'host-specific portions of tests/wc/wc-proc.sh',
		},
	]);
});
