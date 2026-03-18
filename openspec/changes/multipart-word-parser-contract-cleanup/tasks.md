## 1. Lexer Contract

- [ ] 1.1 Replace parser-facing reliance on `TokenKind.GLOB` and `TokenKind.COMMAND_SUB` with structured word-part metadata on generic word-like tokens.
- [ ] 1.2 Update the scanner to record ordered literal, glob, and command substitution segments with quote and escape awareness for each scanned word.
- [ ] 1.3 Add lexer coverage for `src/*.test.ts`, `foo(echo bar)baz`, and quoted wildcard literals.

## 2. Parser Multipart Words

- [ ] 2.1 Refactor `WordParser` to build real `WordPart[]` values from token metadata instead of mapping one token to one AST part.
- [ ] 2.2 Preserve accurate spans and nested substitution parsing for multipart words and standalone substitution words.
- [ ] 2.3 Add parser tests that assert ordered parts for mixed glob, mixed command substitution, and mixed quoted/unquoted words.

## 3. Compiler and IR Preservation

- [ ] 3.1 Introduce a lossless compiled-word representation that keeps ordered parts through `packages/compiler/src/ir.ts` and `packages/compiler/src/compile/compile.ts`.
- [ ] 3.2 Update word stringification and command-argument helpers to remain compatible with the new compiled-word shape without reintroducing data loss.
- [ ] 3.3 Add compile tests proving mixed words keep literal prefixes and suffixes around globs and command substitutions.

## 4. Runtime Compatibility

- [ ] 4.1 Update any runtime evaluators that currently assume one expansion kind per word so mixed words concatenate part results correctly where current subset behavior depends on it.
- [ ] 4.2 Add or adjust targeted execution tests for mixed command substitution and mixed glob word evaluation paths.

## 5. Validation

- [ ] 5.1 Run targeted `bun test` suites for `packages/compiler` and `packages/shfs`.
- [ ] 5.2 Run `bun x ultracite check` and fix any issues introduced by the refactor.
