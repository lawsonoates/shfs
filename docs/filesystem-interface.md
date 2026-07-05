# Filesystem Interface

The shell runs over the `FS` interface exported from `shfs/fs`. `MemoryFS` is the built-in implementation; custom backends implement the same interface.

```typescript
interface FS {
	stat(path: string): Promise<FsInfo>;
	exists(path: string): Promise<boolean>;
	readFile(path: string): Promise<Uint8Array>;
	readLines(path: string): Stream<string>;
	writeFile(
		path: string,
		content: Uint8Array,
		options?: { flag?: OpenFlag; mode?: number }
	): Promise<void>;
	readDirectory(path: string, options?: { recursive?: boolean }): Stream<string>;
	makeDirectory(path: string, options?: { recursive?: boolean; mode?: number }): Promise<void>;
	remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	readLink(path: string): Promise<string>;
	realPath(path: string): Promise<string>;
	symlink(target: string, path: string): Promise<void>;
}
```

## Notes for implementors

- `stat` follows symlinks and returns a structured `FsInfo` (`type`, `size`, `mode`, `mtime`, plus optional POSIX fields). There is no `lstat`; detect links with `readLink`.
- symlinks are created through the FS API (`fs.symlink(target, path)`); there is no `ln` command.
- backends should throw the typed errors exported from `shfs/fs` (listed below) so commands produce the expected error contracts.
- `shfs/fs` also exports the `FS`, `FsInfo`, `FsType`, and `OpenFlag` types.

## Errors

Every error extends `FsError`, which carries a POSIX-style `code` and the offending `path`.

| Error | Code | Thrown when |
| --- | --- | --- |
| `NotFoundError` | `ENOENT` | the path does not exist |
| `NotADirectoryError` | `ENOTDIR` | a directory operation hits a file |
| `IsADirectoryError` | `EISDIR` | a file operation hits a directory |
| `AlreadyExistsError` | `EEXIST` | the destination path already exists |
| `DirectoryNotEmptyError` | `ENOTEMPTY` | removing a non-empty directory without `recursive` |
| `InvalidOperationError` | `EINVAL` | an invalid operation, e.g. `readLink` on a non-symlink |
| `TooManySymbolicLinksError` | `ELOOP` | symlink resolution hits a cycle |

## Error handling

Shell commands never leak `FsError` to the caller: commands catch filesystem errors, write a deterministic message to stderr, and set a nonzero exit code. By default a failed command makes `$` throw a `ShellError` carrying the exit code and captured output:

```typescript
import { Shell, ShellError } from "shfs";
import { MemoryFS } from "shfs/fs";

const { $ } = new Shell(new MemoryFS());

try {
	await $`cat missing.txt`.text();
} catch (error) {
	if (error instanceof ShellError) {
		console.log(error.exitCode); // 1
		console.log(error.stderr.toString()); // cat: /missing.txt: No such file or directory
	}
}

// Or opt out of throwing and inspect the output instead:
const output = await $`cat missing.txt`.nothrow();
console.log(output.exitCode); // 1
```

The typed errors surface when calling the FS API directly. Catch them by class, or match on the POSIX-style `code` shared by every `FsError`:

```typescript
import { FsError, MemoryFS, NotFoundError } from "shfs/fs";

const fs = new MemoryFS();

try {
	await fs.readFile("/missing.txt");
} catch (error) {
	if (error instanceof NotFoundError) {
		console.log(error.path); // /missing.txt
	}
	if (error instanceof FsError) {
		console.log(error.code); // ENOENT
	}
}
```

## Reference implementation

[examples/turso-agent-fs](../examples/turso-agent-fs) is a reference implementation of a custom backend.
