export type FsErrorCode =
	| 'ENOENT'
	| 'ENOTDIR'
	| 'EISDIR'
	| 'EEXIST'
	| 'ENOTEMPTY'
	| 'EINVAL'
	| 'ELOOP';

export class FsError extends Error {
	readonly code: FsErrorCode;
	readonly path: string;

	constructor(code: FsErrorCode, path: string, message: string) {
		super(message);
		this.name = new.target.name;
		this.code = code;
		this.path = path;
	}
}

export class NotFoundError extends FsError {
	constructor(path: string, message: string) {
		super('ENOENT', path, message);
	}
}

export class NotADirectoryError extends FsError {
	constructor(path: string, message: string) {
		super('ENOTDIR', path, message);
	}
}

export class IsADirectoryError extends FsError {
	constructor(path: string, message: string) {
		super('EISDIR', path, message);
	}
}

export class AlreadyExistsError extends FsError {
	constructor(path: string, message: string) {
		super('EEXIST', path, message);
	}
}

export class DirectoryNotEmptyError extends FsError {
	constructor(path: string, message: string) {
		super('ENOTEMPTY', path, message);
	}
}

export class InvalidOperationError extends FsError {
	constructor(path: string, message: string) {
		super('EINVAL', path, message);
	}
}

export class TooManySymbolicLinksError extends FsError {
	constructor(path: string, message: string) {
		super('ELOOP', path, message);
	}
}
