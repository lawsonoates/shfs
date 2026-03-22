## 1. IR Types

- [ ] 1.1 Define `FindPredicateIR` union type (name, path, type, mtime, atime, ctime, newer, inum, uid, gid, user, group)
- [ ] 1.2 Define `FindActionIR` union type (print, printf, exec, execdir)
- [ ] 1.3 Define `FindTraversalIR` options (maxdepth, mindepth, depth, files0From)
- [ ] 1.4 Define `FindStep` interface with starting paths, predicates, traversal, and action
- [ ] 1.5 Add `FindStep` to the `StepIR` union in `ir.ts`

## 2. Compiler Handler

- [ ] 2.1 Create `packages/compiler/src/compile/command/find/find.ts` with `compileFind` function
- [ ] 2.2 Parse starting paths (arguments before first predicate flag)
- [ ] 2.3 Parse name and path predicates (`-name`, `-path`)
- [ ] 2.4 Parse type predicate (`-type`) with validation of type characters
- [ ] 2.5 Parse time predicates (`-mtime`, `-atime`, `-ctime`, `-newer`)
- [ ] 2.6 Parse traversal options (`-maxdepth`, `-mindepth`, `-depth`)
- [ ] 2.7 Parse action flags (`-print`, `-printf`, `-exec`, `-execdir`) including `{}` and `\;`/`+` termination
- [ ] 2.8 Parse `-files0-from` option
- [ ] 2.9 Parse metadata predicates (`-inum`, `-uid`, `-gid`, `-user`, `-group`)
- [ ] 2.10 Register `compileFind` in `handler.ts`

## 3. Runtime Operator

- [ ] 3.1 Create `packages/shfs/src/operator/find/find.ts` with recursive traversal function
- [ ] 3.2 Implement depth-first directory traversal using `fs.readdir()` and `fs.stat()`
- [ ] 3.3 Implement predicate evaluation (AND composition with short-circuit)
- [ ] 3.4 Implement `-name` and `-path` glob matching using picomatch
- [ ] 3.5 Implement `-type` filtering (file vs directory)
- [ ] 3.6 Implement time predicate evaluation (`-mtime`, `-atime`, `-ctime`, `-newer`)
- [ ] 3.7 Implement traversal controls (`-maxdepth`, `-mindepth`, `-depth` post-order)
- [ ] 3.8 Implement `-print` action (default) emitting `FileRecord`
- [ ] 3.9 Implement `-printf` action with format directives (`%p`, `%f`, `%h`, `%s`, `%T+`, `%d`, `\\n`, `\\t`, `%%`)
- [ ] 3.10 Implement `-exec` action (per-file `\;` and batch `+` modes)
- [ ] 3.11 Implement `-execdir` action
- [ ] 3.12 Implement `-files0-from` input reading
- [ ] 3.13 Implement metadata predicate evaluation (`-inum`, `-uid`, `-gid`, `-user`, `-group`)
- [ ] 3.14 Implement error handling (missing paths, permission errors, exit codes)

## 4. Execution Integration

- [ ] 4.1 Add find operator import and dispatch case in `execute.ts`
- [ ] 4.2 Wire find as a stream/transducer step (not an effect)
- [ ] 4.3 Verify pipeline composability (find piped to grep, cat, etc.)

## 5. Test Validation

- [ ] 5.1 Run existing `name-and-path.test.ts` and fix failures
- [ ] 5.2 Run existing `type-matching.test.ts` and fix failures
- [ ] 5.3 Run existing `time-predicates.test.ts` and fix failures
- [ ] 5.4 Run existing `exec-actions.test.ts` and fix failures
- [ ] 5.5 Run existing `printf-format.test.ts` and fix failures
- [ ] 5.6 Run existing `depth-and-traversal.test.ts` and fix failures
- [ ] 5.7 Run existing `files0-from.test.ts` and fix failures
- [ ] 5.8 Run existing `inode-and-ids.test.ts` and fix failures
- [ ] 5.9 Run existing `error-handling.test.ts` and fix failures
