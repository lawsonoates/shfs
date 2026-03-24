#!/usr/bin/env bun

import { $ } from 'bun';

const version = Bun.argv[2];
if (!version) {
	console.error('Usage: bun run publish <version>');
	process.exit(1);
}

// Guard: must be on master
const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== 'master') {
	console.error(`Refusing to release from "${branch}"`);
	process.exit(1);
}

console.log(`\n=== releasing shfs v${version} ===\n`);

// 1. Update versions (root + workspaces)
const pkgJsons = await Array.fromAsync(
	new Bun.Glob('**/package.json').scan({ absolute: true })
);

for (const file of pkgJsons) {
	if (file.includes('node_modules') || file.includes('dist')) {
		continue;
	}

	const text = await Bun.file(file).text();
	const next = text.replace(
		/"version"\s*:\s*"[^"]+"/,
		`"version": "${version}"`
	);

	if (text !== next) {
		await Bun.file(file).write(next);
		console.log('updated:', file);
	}
}

// 2. Install + build
await $`bun install`;
await $`bun run build`;

// 3. Publish ONLY shfs
console.log('\n=== publishing shfs ===\n');
await $`npm publish --access public`.cwd('packages/shfs');

// 4. Commit + tag
await $`git commit -am "release: shfs v${version}"`;
await $`git tag v${version}`;
await $`git push --follow-tags`;

// 5. Merge release back into dev
console.log('\n=== merging master into dev ===\n');
await $`git checkout dev`;
try {
	await $`git merge master -m "chore: merge release v${version} into dev"`;
	await $`git push`;
	console.log('dev is now up to date with master');
} catch {
	await $`git merge --abort`;
	console.error(
		'⚠ merge conflict: run `git checkout dev && git merge master` and resolve manually'
	);
	process.exit(1);
} finally {
	await $`git checkout master`;
}

console.log(`\n=== done: shfs v${version} ===\n`);
