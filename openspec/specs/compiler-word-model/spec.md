# compiler-word-model Specification

## Purpose
TBD - created by archiving change multipart-word-parser-contract-cleanup. Update Purpose after archive.
## Requirements
### Requirement: Canonical word token contract
The compiler frontend MUST use generic word-like token kinds (`WORD`, `NAME`, and `NUMBER`) as the canonical lexer/parser contract for shell words. Expansion-specific details such as glob segments, command substitutions, and quoted literal spans MUST be carried in ordered token metadata instead of requiring parser-facing `GLOB` or `COMMAND_SUB` token kinds.

#### Scenario: Mixed glob word is emitted as one word token with part metadata
- **WHEN** the lexer scans a word such as `src/*.test.ts`
- **THEN** it emits one word-like token whose metadata preserves the ordered literal, glob, and literal segments for that shell word

#### Scenario: Mixed command substitution word is emitted as one word token with part metadata
- **WHEN** the lexer scans a word such as `foo(echo bar)baz`
- **THEN** it emits one word-like token whose metadata preserves the literal prefix, command substitution segment, and literal suffix in order

#### Scenario: Quoted wildcard text stays literal in token metadata
- **WHEN** the lexer scans a word containing quoted or escaped wildcard characters
- **THEN** those characters are represented as literal segments and are not marked as glob metadata

### Requirement: Multipart word structure is preserved through parsing and compilation
The parser and compiler MUST preserve the ordered sequence of literal, glob, and command substitution parts for a single shell word instead of collapsing mixed words into one opaque expansion value.

#### Scenario: Mixed glob word becomes ordered AST parts
- **WHEN** the parser processes `ls src/*.test.ts`
- **THEN** the path argument is represented as a word with literal `src/`, glob `*`, and literal `.test.ts` parts in order

#### Scenario: Mixed command substitution word keeps adjacent literals
- **WHEN** the parser and compiler process `echo foo(echo bar)baz`
- **THEN** the compiled word representation keeps the leading literal `foo`, the command substitution, and the trailing literal `baz` without dropping or flattening adjacent text

#### Scenario: Standalone substitutions continue to work
- **WHEN** the parser and compiler process an argument that is only a command substitution, such as `cd (echo subdir)`
- **THEN** the word is still represented correctly as a single substitution part and remains compatible with downstream evaluation
