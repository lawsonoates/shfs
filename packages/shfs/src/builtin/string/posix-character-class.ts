const NAMED_POSIX_CLASS_REGEX = /\[\[:(\^?)([a-z]+):\]\]/g;

// Fish's PCRE2 builder leaves UCP disabled. These stable ASCII ranges mirror
// PCRE2's default named-class table without introducing host-locale behavior.
const POSIX_CLASS_CONTENT: Readonly<Record<string, string>> = {
	alnum: 'A-Za-z0-9',
	alpha: 'A-Za-z',
	ascii: '\\x00-\\x7F',
	blank: '\\x09\\x20',
	cntrl: '\\x00-\\x1F\\x7F',
	digit: '0-9',
	graph: '\\x21-\\x7E',
	lower: 'a-z',
	print: '\\x20-\\x7E',
	punct: '\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E',
	space: '\\x09-\\x0D\\x20',
	upper: 'A-Z',
	word: 'A-Za-z0-9_',
	xdigit: 'A-Fa-f0-9',
};

/** Translate Fish's documented exact `[[:name:]]` and `[[:^name:]]` sets. */
export function translateNamedPosixClasses(pattern: string): string {
	return pattern.replace(
		NAMED_POSIX_CLASS_REGEX,
		(token: string, inverse: string, name: string) => {
			const content = POSIX_CLASS_CONTENT[name];
			if (content === undefined) {
				return token;
			}
			return `[${inverse}${content}]`;
		}
	);
}
