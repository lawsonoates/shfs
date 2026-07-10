# Execution Boundary Audit Guide

This guide describes how to audit context propagation across every execution
boundary in `shfs`. It complements the canonical subset decision in
`notes/shfs-subset-boundary.md` and the upstream coverage inventory in
`docs/fish-discrepancies.md`.

The audit is not a full Fish conformance project. It checks that features which
are individually in scope still obey their contracts when execution crosses a
function, block, pipeline stage, command substitution, or child-command
boundary.

## Why this audit exists

Feature-by-feature tests can all pass while their composition is broken. For
example, the suite can prove that command-scoped assignments work for builtins,
functions hide caller locals, and `read` accepts pipeline input without proving
that:

- a command-scoped assignment is visible inside the function it invokes;
- a function body inherits the function call's stdin;
- an input redirection on a function overrides pipeline stdin; or
- sequential reads in a function share one stdin cursor.

Upstream Fish tests contain useful examples across many check files. Selecting
only the upstream file whose name matches a newly implemented feature misses
interactions embedded in files whose primary subject is out of scope.

## Authoritative scope

Before auditing a behavior, classify it against
`notes/shfs-subset-boundary.md`:

1. Audit interactions only when every required behavior is in scope.
2. Reduce away out-of-scope setup while preserving the in-scope contract.
3. Do not import host-process, job-control, interactive, exported-variable, or
   exact-diagnostic requirements merely because an upstream test uses them.
4. Record reductions in the test comment so the provenance remains reviewable.

For example, `tests/checks/disown-parent.fish` uses an external helper and
`disown`, both out of scope. Its core pipeline-to-function-to-`read` behavior is
in scope and can be reduced to `echo value | consume`.

## Execution-boundary inventory

Audit these boundaries independently. The implementation landmarks are listed
to make the guide resilient to test-file reorganization.

| Boundary | Current implementation landmark | Main audit concern |
| --- | --- | --- |
| Shell invocation | `Shell._exec` -> `execute` | State preserved between separate shell calls versus fresh script-local state |
| Script and statement list | `executeScript`, `runStatementList` | Status gating, control-signal propagation, output order |
| Control-flow body | `runBeginStatement`, `runIfStatement`, `runWhileStatement`, `runForStatement`, `runBlockBody` | Local scope lifetime, status, loop control, assignments on compound commands |
| Runtime function | `runFunctionCall` | Scope barrier, `$argv`, command assignments, shared stdin, output and status |
| Command substitution | `evaluateCommandSubstitutionEffect` | Variable visibility, state isolation, captured output, status, nested failures |
| Pipeline step | `runPipeline`, `executeStreamStep`, `executeActionStep` | Stdin source, stdout/stderr routing, redirection precedence, status preservation |
| Registry handler | `CommandRegistry.executeStep`, `createBuiltinRuntime` | The handler receives the context already resolved by the executor |
| Batched child command | `xargs.runCommand` | Deliberately inherited state versus isolated child status, stderr, and input |

When a new execution wrapper is introduced, add it to this inventory before
adding tests.

## Context dimensions

For every boundary, decide the contract for each applicable context dimension.
Use these four verbs consistently:

- **Inherit**: the nested execution sees the same value or stream.
- **Isolate**: the nested execution cannot see or mutate the caller's value.
- **Override**: a more specific source replaces an inherited source.
- **Propagate**: changes or output produced inside cross back to the caller.

Audit at least these dimensions:

| Context | Questions to answer |
| --- | --- |
| Local variable frames | Which frames remain visible? Where is the function barrier? |
| Command assignments | Are temporary values visible to the invoked command and gone afterward? |
| Global variables | Are reads and permitted writes shared? |
| Function registry | Can nested execution call already-defined functions? Do definitions persist where intended? |
| `$argv` and named arguments | Do callee bindings override conflicting temporary variables? |
| Stdin | Is there one shared cursor? Which construct consumes it? |
| Input redirection | Does explicit redirection override inherited or pipeline stdin? Are closed descriptors represented? |
| Stdout records | Are records captured, piped, redirected, or returned in the correct order? |
| Stderr | Is it routed independently and merged only when requested? |
| Status | Which command sets it, which wrappers preserve it, and where is it propagated? |
| Working directory | Do changes persist across the boundary when Fish semantics require it? |
| Control signals | Where are `return`, `break`, and `continue` consumed? |

Not every cell needs a test. A cell needs one when the boundary transforms,
copies, filters, buffers, or routes that context value.

## Minimum contract matrix

Start with this matrix and add rows only when the subset grows. `Covered` means
there is a focused assertion for the interaction, not merely separate tests for
the two features.

| Boundary | Contract | Coverage to locate or add |
| --- | --- | --- |
| Function | Inherit globals | Global visible inside function |
| Function | Isolate ordinary caller locals | Caller local hidden by function barrier |
| Function | Inherit command assignments | `x=value function_call` sees `x` only during the call |
| Function | Override temporary bindings | `$argv` and named arguments have their Fish precedence |
| Function | Inherit pipeline stdin | Function-body `read` consumes producer output |
| Function | Override stdin | `producer | function_call < file` reads the file |
| Function | Share stdin cursor | Consecutive reads consume consecutive records |
| Function | Propagate stdout/stderr | Function output can be piped and redirected normally |
| Function | Propagate status/control | `return` and final command status reach the caller |
| Block/control flow | Isolate block locals | `set -l` lifetime matches the block |
| Block/control flow | Inherit compound assignments | Assignment prefixes cover the intended block only |
| Command substitution | Capture output | Lines and trailing-newline behavior are correct |
| Command substitution | Define state behavior | Variable, cwd, function, and status effects match the declared subset |
| Pipeline step | Override stdin/stdout | Pipe defaults yield to explicit redirects |
| Pipeline step | Route stderr | `2>|`, `2>&1`, and file redirects use the intended channel |
| Pipeline step | Preserve status | Producer and final-stage status rules are explicit |
| Action step | Propagate mutable shell state | `cd` updates the parent while temporary frames disappear |
| `xargs` child | Define inheritance | Cwd, globals, functions, stdin, status, and stderr are each intentional |

## Upstream research workflow

Use the cached Fish source rather than relying only on documentation or the 20
currently ported check files:

```sh
opensrc path fish-shell/fish-shell#master
rg "function|read|<|\\|" $(opensrc path fish-shell/fish-shell#master)/tests/checks
```

Search by interaction, then inspect the surrounding test. Useful starting
points from the 2026-07-07 `master` snapshot are:

- `tests/checks/fish_add_path.fish:67-72`: command assignment invoking an
  autoloaded function which reads `PATH`;
- `tests/checks/xdg-data-dirs-default.fish:25-33`: assignment-prefixed
  function invocation;
- `tests/checks/disown-parent.fish:8-13`: pipeline input consumed by `read`
  inside a function;
- `tests/checks/locale.fish:9-20`: a function used as a pipeline consumer;
- `tests/checks/read.fish:356-373`: reads and variable scope inside a function;
- `tests/checks/read.fish:375-382`: multiple consumers sharing one stdin
  cursor;
- `tests/checks/variable-assignment.fish`: temporary assignment lifetime and
  compound-command coverage;
- `tests/checks/function.fish`, `tests/checks/function-definition.fish`, and
  `tests/checks/scoping.fish`: function barriers and variable lifetime;
- `tests/checks/redirect.fish` and `tests/checks/fds.fish`: descriptor routing
  and precedence;
- `tests/checks/cmdsub.fish` and `tests/checks/expansion.fish`: nested execution
  during expansion;
- `tests/checks/pipeline-pgroup.fish`, `tests/checks/pipestatus.fish`, and
  `tests/checks/output-buffering.fish`: pipeline-stage interactions, after
  removing out-of-scope process-group requirements.

An upstream test may be valuable even when it cannot be ported verbatim. Keep
the smallest script that still exercises the boundary and replace only its
out-of-scope setup.

## Test design rules

1. Prefer one test per contract. Do not build the full Cartesian product of all
   features.
2. Assert observable values and status. A shell bug can emit nothing while
   still returning status 0.
3. Assert lifetime separately from visibility: temporary values must be visible
   during the call and absent afterward.
4. For streams, assert cursor behavior, not only the first value. Two reads or a
   read followed by another consumer reveals accidental draining or replay.
5. For redirects, provide both a pipeline value and a file value so precedence
   is observable.
6. Preserve an existing component test when adding an interaction test. The new
   test complements it rather than replacing it.
7. Add an upstream path and line reference to every adaptation. If no direct
   upstream case exists, label it as an `shfs` regression and state the Fish
   contract it protects.
8. Keep every upstream-derived case under `test/spec/fish/` in the subset file
   matching its upstream `tests/checks/*.fish` file. Never combine upstream
   files in one subset suite; convert underscores in the upstream basename to
   kebab-case only when required by the repository filename lint. Keep
   `shfs`-only regressions outside `spec/`.
9. Run the new test red before implementing the fix, then run the focused suite,
   the related Fish subset suites, and the full package suite.

## Suggested audit order

1. Runtime functions: scope, assignments, stdin, routing, status, and cwd.
2. Pipeline/action child contexts: all fields copied by `createChildContext` and
   returned by `propagateChildContext`.
3. Command substitutions: explicitly decide which state is shared or isolated.
4. Blocks and control flow: assignments, local frames, status, and signals.
5. Registry handlers: remove handler-specific routing gaps where safe.
6. `xargs` child execution: document and test every inherited field.
7. Shell calls across separate `Shell.$` invocations: persistent globals,
   functions, status, and cwd versus fresh locals and stdin.

## Audit record template

Use one table per boundary in a follow-up document or pull request:

| Context | Expected rule | Existing test | Upstream evidence | Gap/action |
| --- | --- | --- | --- | --- |
| Variables | Inherit/isolate/override/propagate | File and test name | Upstream file and lines | None or proposed test |

For each gap, record:

- the minimal Fish script;
- why every feature in it is in scope;
- any reduction from upstream setup;
- current `shfs` output, status, and stderr;
- expected output, status, and stderr;
- implementation landmark likely responsible; and
- focused and broad commands used for verification.

## Definition of done

A boundary is audited when:

- every applicable context dimension has an explicit expected rule;
- each transformation or routing decision has focused coverage;
- upstream evidence was searched beyond the currently ported files;
- out-of-scope behavior is documented rather than accidentally imported;
- failing cases are minimized and carry provenance;
- the focused, Fish subset, package, typecheck, and Ultracite checks pass; and
- the audit matrix records any intentionally deferred gaps.

## Current function-boundary slice

The first slice of this audit covers four contracts:

1. command-scoped assignments are copied into the function frame without
   exposing ordinary caller locals;
2. pipeline stdin is inherited by the function body;
3. explicit function input redirection overrides pipeline stdin; and
4. sequential reads share one function-invocation cursor.

These are three reduced upstream adaptations plus one `shfs` regression. They
form one implementation slice because they validate the context handed to
`runFunctionCall`, but their tests remain organized by provenance: each Fish
adaptation lives in the subset file matching its upstream check file, while the
original regression lives outside `spec/`.
