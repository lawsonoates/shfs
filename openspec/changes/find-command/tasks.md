## 1. IR Types

- [ ] 1.1 Define `FindPredicateIR` union type for subset predicates (`name`, `path`, `type`)
- [ ] 1.2 Define `FindActionIR` or equivalent print behavior for default and explicit `-print`
- [ ] 1.3 Define `FindTraversalIR` options (`maxdepth`, `mindepth`, `depth`)
- [ ] 1.4 Define `FindStep` interface with starting paths, predicates, traversal, and action
- [ ] 1.5 Add `FindStep` to the `StepIR` union in `ir.ts`

## 2. Compiler Handler

- [ ] 2.1 Create `packages/compiler/src/compile/command/find/find.ts` with `compileFind` function
- [ ] 2.2 Parse starting paths (arguments before first predicate flag)
- [ ] 2.3 Parse name and path predicates (`-name`, `-path`)
- [ ] 2.4 Parse `-type` with validation for supported type characters and comma-separated lists using only `f` and `d`
- [ ] 2.5 Parse traversal options (`-maxdepth`, `-mindepth`, `-depth`)
- [ ] 2.6 Parse explicit `-print` and normalize omitted actions to default print behavior
- [ ] 2.7 Reject unsupported predicates and options with deterministic subset errors
- [ ] 2.8 Register `compileFind` in `handler.ts`

## 3. Runtime Operator

- [ ] 3.1 Create `packages/shfs/src/operator/find/find.ts` with recursive traversal function
- [ ] 3.2 Implement depth-first directory traversal using `fs.readdir()` and `fs.stat()`
- [ ] 3.3 Implement predicate evaluation (AND composition with short-circuit)
- [ ] 3.4 Implement `-name` and `-path` glob matching using picomatch
- [ ] 3.5 Implement `-type` filtering for regular files and directories
- [ ] 3.6 Implement traversal controls (`-maxdepth`, `-mindepth`, `-depth` post-order)
- [ ] 3.7 Implement default and explicit `-print` emitting `FileRecord`
- [ ] 3.8 Implement deterministic error handling for missing starting paths, unsupported predicates/options, and invalid arguments

## 4. Execution Integration

- [ ] 4.1 Add find operator import and dispatch case in `execute.ts`
- [ ] 4.2 Wire find as a stream/transducer step (not an effect)
- [ ] 4.3 Verify pipeline composability (find piped to grep, cat, etc.)

## 5. Test Validation

- [ ] 5.1 Run existing `name-and-path.test.ts` and fix failures
- [ ] 5.2 Run existing `type-matching.test.ts` and fix failures
- [ ] 5.3 Run existing `depth-and-traversal.test.ts` and fix failures
- [ ] 5.4 Run existing `error-handling.test.ts` and fix failures
- [ ] 5.5 Add or verify coverage for pipeline composability within the subset
