import {
	splitNameBeforeEquals,
	startsWithLongPrefix,
	startsWithNoLongPrefix,
	startsWithShortPrefix,
} from '../utils';
import type { FlagDef, FlagEntry, FlagIndex } from './types';

const SHORT_NAME_REGEX = /^[A-Za-z]$/;
const LONG_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export function buildFlagIndex(flagDefs: Record<string, FlagDef>): FlagIndex {
	const canonical = new Map<string, FlagEntry>();
	const short = new Map<string, FlagEntry>();
	const long = new Map<string, FlagEntry>();

	const add = (
		map: Map<string, FlagEntry>,
		token: string,
		entry: FlagEntry
	) => {
		const prev = map.get(token);
		if (!prev) {
			map.set(token, entry);
			return;
		}
		throw new Error(
			`Duplicate flag token "${token}" for "${entry.canonical}" and "${prev.canonical}"`
		);
	};

	for (const [canonicalName, def] of Object.entries(flagDefs)) {
		if (!(def.short || def.long)) {
			throw new Error(
				`Flag "${canonicalName}" must define at least one of "short" or "long".`
			);
		}

		const entry: FlagEntry = { canonical: canonicalName, def };
		canonical.set(canonicalName, entry);

		if (def.short !== undefined) {
			if (!SHORT_NAME_REGEX.test(def.short)) {
				throw new Error(
					`Invalid short flag for "${canonicalName}": "${def.short}". Expected a single letter [A-Za-z].`
				);
			}
			add(short, `-${def.short}`, entry);
		}

		if (def.long) {
			if (!LONG_NAME_REGEX.test(def.long)) {
				throw new Error(
					`Invalid long flag for "${canonicalName}": "${def.long}". Expected [A-Za-z0-9][A-Za-z0-9-]*.`
				);
			}
			add(long, `--${def.long}`, entry);
		}
	}

	const isFlagToken = (token: string): boolean => {
		if (token === '--') {
			return true;
		}
		if (token === '-') {
			return false;
		}

		if (startsWithLongPrefix(token)) {
			const name = splitNameBeforeEquals(token);
			if (long.has(name)) {
				return true;
			}

			if (startsWithNoLongPrefix(name)) {
				const base = `--${name.slice('--no-'.length)}`;
				const entry = long.get(base);
				return !!entry && !entry.def.takesValue;
			}
			return false;
		}

		if (startsWithShortPrefix(token)) {
			const ch = token[1] ?? '';
			if (!SHORT_NAME_REGEX.test(ch)) {
				return false;
			}
			return short.has(`-${ch}`);
		}

		return false;
	};

	return { canonical, short, long, isFlagToken };
}

export function isShortFlagCharacter(ch: string): boolean {
	return SHORT_NAME_REGEX.test(ch);
}
