import { ArgParseError, type ParseDiagnostic } from './types';

export const UNKNOWN_FLAG_PREFIX = 'Unknown flag: ';

export function createParseDiagnostic(
	code: ParseDiagnostic['code'],
	token: string,
	tokenIndex: number,
	error: unknown
): ParseDiagnostic {
	let message = 'Unknown parse error.';
	if (isArgParseError(error)) {
		message = error.message;
	} else if (error instanceof Error) {
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

export function argParseError(
	code: ArgParseError['code'],
	message: string,
	token?: string
): ArgParseError {
	return new ArgParseError({
		code,
		message,
		token,
	});
}

export function unknownFlagError(token: string): ArgParseError {
	return argParseError(
		'unknown-flag',
		`${UNKNOWN_FLAG_PREFIX}${token}`,
		token
	);
}

export function isUnknownFlagError(error: unknown): boolean {
	return isArgParseError(error) && error.code === 'unknown-flag';
}

export function isArgParseError(error: unknown): error is ArgParseError {
	return (
		error instanceof ArgParseError ||
		(typeof error === 'object' &&
			error !== null &&
			'_tag' in error &&
			error._tag === 'ArgParseError')
	);
}
