## 1. IR Types

- [x] 1.1 Define `FindPredicateIR` union type for subset predicates (`name`, `path`, `type`)
- [x] 1.2 Define `FindActionIR` or equivalent print behavior for default and explicit `-print`
- [x] 1.3 Define `FindTraversalIR` options (`maxdepth`, `mindepth`, `depth`)
- [x] 1.4 Define `FindStep` interface with starting paths, predicates, traversal, and action
- [x] 1.5 Add `FindStep` to the `StepIR` union in `ir.ts`

## 2. Compiler Handler

- [x] 2.1 Create `packages/compiler/src/compile/command/find/find.ts` with `compileFind` function
- [x] 2.2 Parse starting paths (arguments before first predicate flag)
- [x] 2.3 Parse name and path predicates (`-name`, `-path`)
- [x] 2.4 Parse `-type` with validation for supported type characters and comma-separated lists using only `f` and `d`
- [x] 2.5 Parse traversal options (`-maxdepth`, `-mindepth`, `-depth`)
- [x] 2.6 Parse explicit `-print` and normalize omitted actions to default print behavior
- [x] 2.7 Reject unsupported predicates and options with deterministic subset errors
- [x] 2.8 Register `compileFind` in `handler.ts`

## 3. Runtime Operator

- [x] 3.1 Create `packages/shfs/src/operator/find/find.ts` with recursive traversal function
- [x] 3.2 Implement depth-first directory traversal using `fs.readdir()` and `fs.stat()`
- [x] 3.3 Implement predicate evaluation (AND composition with short-circuit)
- [x] 3.4 Implement `-name` and `-path` glob matching using picomatch
- [x] 3.5 Implement `-type` filtering for regular files and directories
- [x] 3.6 Implement traversal controls (`-maxdepth`, `-mindepth`, `-depth` post-order)
- [x] 3.7 Implement default and explicit `-print` emitting `FileRecord`
- [x] 3.8 Implement deterministic error handling for missing starting paths, unsupported predicates/options, and invalid arguments

## 4. Execution Integration

- [x] 4.1 Add find operator import and dispatch case in `execute.ts`
- [x] 4.2 Wire find as a stream/transducer step (not an effect)
- [x] 4.3 Verify pipeline composability (find piped to grep, cat, etc.)

## 5. Test Validation

- [x] 5.1 Run existing `name-and-path.test.ts` and fix failures
- [x] 5.2 Run existing `type-matching.test.ts` and fix failures
- [x] 5.3 Run existing `depth-and-traversal.test.ts` and fix failures
- [x] 5.4 Run existing `error-handling.test.ts` and fix failures
- [x] 5.5 Add or verify coverage for pipeline composability within the subset
