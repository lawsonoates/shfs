import type { ParseDiagnostic } from './types';

export const UNKNOWN_FLAG_PREFIX = 'Unknown flag: ';

export function createParseDiagnostic(
	code: ParseDiagnostic['code'],
	token: string,
	tokenIndex: number,
	error: unknown
): ParseDiagnostic {
	let message = 'Unknown parse error.';
	if (error instanceof Error) {
		message = error.message;
	} else if (typeof error === 'string') {
		message = error;
	}
	return {
		code,
		message,
		token,
		tokenIndex,
	};
}

export function throwUnknownFlag(token: string): never {
	throw new Error(`${UNKNOWN_FLAG_PREFIX}${token}`);
}

export function isUnknownFlagError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.startsWith(UNKNOWN_FLAG_PREFIX);
}
