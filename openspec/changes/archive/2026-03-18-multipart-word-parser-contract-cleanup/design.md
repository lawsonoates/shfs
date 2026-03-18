## Context

`packages/compiler/src/lexer/scanner.ts` already classifies shell words as `WORD`, `NAME`, or `NUMBER` tokens and uses boolean flags like `containsGlob` and `containsExpansion` to describe interesting content. At the same time, `packages/compiler/src/lexer/token.ts` still exposes `GLOB` and `COMMAND_SUB` token kinds, and `packages/compiler/src/parser/word.ts` currently turns most scanned tokens into exactly one AST part based on those coarse flags.

That leaves the frontend in an awkward middle state:
- mixed words such as `src/*.test.ts` or `foo(echo bar)baz` are usually represented as one token and then collapsed into one AST part
- `packages/compiler/src/compile/compile.ts` further flattens mixed glob words into a single pattern and mixed command substitution words into a single substitution, dropping adjacent literal text
- the scanner strips quotes and escape markers from token spelling, so the parser cannot reliably reconstruct which characters were quoted by re-parsing the token text alone

Suggestions 1 and 3 from `notes/compiler-structure-improvements.note` are therefore coupled. Making multipart words real requires a cleaner lexer/parser contract that preserves per-part structure before the parser ever sees the token.

## Goals / Non-Goals

**Goals:**
- Make one lexer/parser contract canonical for shell words.
- Preserve ordered literal, glob, and command substitution segments for a single word through AST and compiler IR.
- Keep quoted or escaped wildcard characters as literal segments instead of letting multipart splitting misclassify them.
- Leave the codebase ready for later runtime expansion cleanup without forcing the full PR 2 redesign into this change.

**Non-Goals:**
- Reworking the full runtime expansion subsystem for args, redirections, and builtins.
- Introducing new shell syntax beyond already-supported literals, globs, and command substitutions.
- Broad parser error-flow or diagnostics unification.
- Removing the existing standalone command substitution behavior that already works for single-part words.

## Decisions

### 1. Canonicalize on generic word tokens plus structured metadata
- Decision: Treat `WORD`, `NAME`, and `NUMBER` as the only parser-facing shell word token kinds, and move intra-word structure into ordered token metadata for literal, glob, and command substitution segments.
- Why: The scanner already behaves mostly this way, and the real ambiguity lives inside a single word rather than in top-level token kind classification.
- Alternative considered: Emit richer token kinds such as `GLOB` and `COMMAND_SUB` directly from the scanner.
- Why not: Mixed words still need ordered part boundaries inside one shell word, and token kinds alone do not preserve quoted-vs-literal segment details.

### 2. Record multipart boundaries in the scanner, not by re-parsing token spelling later
- Decision: Extend scanner-produced word metadata so it records ordered segments while quote and escape context is still available, then let `WordParser` map those segments into AST nodes.
- Why: The scanner is the only stage that still knows which wildcard characters were quoted or escaped before spelling normalization removes that information.
- Alternative considered: Split token spelling inside `WordParser`.
- Why not: Once quotes are stripped, the parser cannot reliably distinguish a quoted literal `*` from an unquoted glob `*`.

### 3. Preserve multipart words in IR with a lossless compiled-word shape
- Decision: Replace the current scalar-only compiled word model with a compound representation that preserves ordered parts through `packages/compiler/src/ir.ts` and `packages/compiler/src/compile/compile.ts`.
- Why: The current union shape cannot represent `literal + commandSub + literal` without dropping data, which defeats the purpose of making multipart AST words real.
- Alternative considered: Keep the current `literal | glob | commandSub` union and continue flattening mixed words into one string-like value.
- Why not: Flattening loses literal prefixes and suffixes around command substitutions and hides the structure future expansion work needs.

### 4. Keep command argument parsing on string views, but make the view derive from the new structure
- Decision: Continue feeding command option parsers with `expandedWordToString()`-style string views while updating the helper to serialize compound words without data loss.
- Why: Command flag parsing only needs a stable textual form; it does not need to understand multipart structure directly.
- Alternative considered: Rewrite every command compiler to inspect word parts instead of using shared stringification helpers.
- Why not: That would spread this refactor across many command handlers without adding meaningful value in this PR.

### 5. Limit runtime changes to compatibility shims
- Decision: Update only the runtime evaluation helpers that must understand compound words to keep current subset behavior working; defer full expansion centralization to the follow-up change for improvement 2.
- Why: This PR is meant to fix the frontend contract and preserve structure, not to redesign the full runtime expansion pipeline at the same time.
- Alternative considered: Do no runtime work in this change.
- Why not: Mixed words with command substitutions would remain structurally correct in IR but still evaluate incorrectly at execution time.

## Risks / Trade-offs

- [Risk] Richer token metadata can drift from token spelling or spans. -> Mitigation: add focused lexer tests that assert segment order, segment text, and reconstructed full spelling.
- [Risk] A compound IR word shape touches many helpers and command compilers. -> Mitigation: keep helper entry points stable and concentrate shape changes behind shared constructors and stringification/evaluation utilities.
- [Risk] Quoted and escaped wildcard edge cases may regress during scanner refactoring. -> Mitigation: add targeted tests for quoted `*`, escaped wildcard characters, and mixed quoted/unquoted words before refactoring.
- [Risk] The runtime compatibility shim can start to overlap with the later expansion-unification change. -> Mitigation: keep this PR limited to concatenating/evaluating parts within one word and avoid broader redirection or command-specific expansion rewrites.

## Migration Plan

1. Add spec coverage and failing lexer/parser/compiler tests for mixed multipart words.
2. Introduce structured word-segment metadata on generic word tokens and remove parser reliance on expansion-specific token kinds.
3. Refactor `WordParser` to build real multipart AST words from token metadata.
4. Update compiler IR and helper utilities to preserve multipart words without flattening.
5. Patch the narrow runtime evaluation points that must handle compound words, then run targeted compiler and shell tests.

Rollback strategy:
- Revert the token metadata, parser, and IR changes together, returning to the previous single-part parsing behavior and scalar compiled-word representation.

## Open Questions

- None at proposal time. The main architectural choice is to use generic word tokens plus structured metadata, and this design assumes that direction.
