## Context

SHFS currently handles user-facing failures through several parallel mechanisms. The parser records diagnostics in `ErrorReporter` but also throws `ParseSyntaxError` subclasses. Command compilers such as `grep` and `find` produce command-specific diagnostic payloads in IR. Runtime execution paths mix usage-error booleans, silent status changes, and caught exceptions. This makes the shell feel uneven to users and makes it harder to add recovery, editor feedback, or consistent stderr formatting.

The change is cross-cutting: it touches parser/frontend behavior, command compiler output, runtime expansion/execution, and shell-boundary reporting. The design needs to improve user-facing consistency without forcing a risky rewrite of the entire compiler/runtime stack in one step.

## Goals / Non-Goals

**Goals:**
- Define one shared diagnostic model that can represent parse, compile, expansion, and runtime failures
- Give ordinary user input mistakes one consistent reporting path, regardless of which subsystem detects them
- Standardize shell-facing formatting and status behavior for diagnostics
- Preserve enough source metadata for precise and testable errors, including spans when available and token/index references when spans are not available
- Support incremental adoption so existing commands can migrate one by one

**Non-Goals:**
- Implement IDE/editor integrations in this change
- Introduce full parser recovery or multi-error parsing beyond what current architecture safely supports
- Remove every thrown exception immediately
- Normalize wording for all existing commands to match fish exactly

## Decisions

### 1. Introduce one shared diagnostic type with phase metadata

The compiler/runtime boundary will use a single diagnostic shape with stable fields for `phase`, `severity`, `code`, `message`, and optional location metadata such as `span`, `token`, `tokenIndex`, and `command`.

This gives every layer one common carrier for user-facing problems while still allowing phase-specific detail. Parse errors can use spans, command argument errors can use tokens and indices, and runtime file or expansion errors can identify the active command.

Alternative considered: Keep parser diagnostics and command diagnostics separate, and only unify formatting. Rejected because it would preserve incompatible data models and make tooling/reporting logic continue to branch by subsystem.

### 2. Treat diagnostics as the canonical path for ordinary user mistakes

Invalid syntax, invalid flags, missing option values, invalid numeric arguments, ambiguous expansion results, and other expected user mistakes will be represented as diagnostics instead of relying on exceptions for normal control flow.

Exceptions remain allowed for internal faults, impossible states, or abort conditions where continued evaluation would be unsafe. Those exceptions should either be converted into a diagnostic at the shell boundary or surfaced as internal faults distinct from ordinary usage errors.

Alternative considered: Throw every user-facing error. Rejected because it stops at the first failure, makes structured reporting awkward, and keeps command/runtime behavior inconsistent with command compilers that already accumulate diagnostics.

### 3. Add a shell-boundary formatter and status mapper

The shell entrypoint will own rendering diagnostics to user-visible output and mapping them to deterministic status codes. Lower layers should produce diagnostics, not ad hoc formatted stderr strings, wherever practical.

This makes the external shell behavior consistent even while internal migration is still in progress. It also creates one place to tune message style and status semantics.

Alternative considered: Let each command or subsystem print its own diagnostics. Rejected because it perpetuates the current inconsistency and duplicates formatting logic.

### 4. Migrate incrementally by adding adapters for existing parser and command error types

The first implementation step should not replace all existing types at once. Instead:
- parser exceptions should expose or convert to the shared diagnostic shape
- parser `ErrorReporter` diagnostics should already match or map directly
- command-specific diagnostics such as `GrepDiagnosticIR` and `FindDiagnosticIR` should be replaced or wrapped by the shared type
- runtime execution paths that currently use `usageError` booleans should consult the shared diagnostic collection instead

This keeps the change reviewable and avoids destabilizing unrelated compiler logic.

Alternative considered: Big-bang replacement of all parser/compiler/runtime error paths. Rejected because the affected code paths are broad and the risk of regressions would be much higher.

### 5. Preserve user-visible command context in diagnostics

The shared diagnostic shape should preserve command identity and location context where possible so users can tell whether a failure came from shell syntax, command argument validation, expansion, or execution. The message itself should remain human-readable without requiring stack traces.

Alternative considered: Reduce diagnostics to only message + status. Rejected because it would throw away information needed for precise tests, future editor support, and helpful UX.

## Risks / Trade-offs

- **[Migration overlap between old and new error paths]** -> Mitigation: add adapters first, then migrate call sites one subsystem at a time with tests that cover both diagnostic shape and rendered output.
- **[Message churn in tests]** -> Mitigation: centralize formatting and update tests to assert on stable codes/fields where possible, reserving full-string assertions for shell-boundary output tests.
- **[Parser flow becomes harder to follow]** -> Mitigation: keep parser throwing behavior temporarily, but require thrown syntax errors to carry shared diagnostic data so the rest of the system can stay uniform.
- **[Some runtime failures lack precise spans]** -> Mitigation: allow token-, command-, and phase-level metadata when span data is unavailable rather than forcing every error into the same location format.

## Migration Plan

1. Introduce the shared diagnostic type and shell-boundary formatting helpers.
2. Map parser `ErrorReporter` output and `ParseSyntaxError` variants into that type.
3. Convert command compiler diagnostics (`grep`, `find`, and shared arg parsing) to the shared type.
4. Replace `usageError`-only decision points with checks against shared diagnostics.
5. Normalize expansion/runtime failures that are ordinary user mistakes into the same diagnostic pipeline.
6. Keep internal exceptions distinct and ensure they do not masquerade as ordinary usage diagnostics.

## Open Questions

- Should the shared diagnostic type live in compiler IR, or in a smaller shared module imported by both compiler and runtime?
- Should shell-boundary formatting map all ordinary usage/syntax errors to the same non-zero status, or preserve command-specific distinctions where they already exist?
- How far should the first pass go in converting runtime-generated plain strings into structured diagnostics versus leaving some legacy formatting in place temporarily?
