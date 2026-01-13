# Fish Subset Lexer Specification

## Overview

This specification describes the lexical analysis for a **fish-inspired subset** language. This is intentionally **not POSIX** and **not full fish**. It is a deterministic, filesystem-focused command language designed to compile to a small IR and execute against a provided `FS` interface.

## Design Principles

1. **Filesystem-first** - Commands operate on files, paths, and streams
2. **Deterministic execution** - Same input → same IR → same result
3. **Small, explicit semantics** - Parse → expand → execute
4. **Fish-inspired, not fish-compatible** - Familiar syntax, limited behavior

## Basic Token Types

### Command Tokens
- **NAME**: Valid identifier (command name, alphanumeric + underscore/hyphen)
- **WORD**: Generic word/argument
- **NUMBER**: Numeric literal

### Operators
- **PIPE**: `|` - Pipe operator
- **GREAT**: `>` - Output redirection (Phase 2)
- **LESS**: `<` - Input redirection (Phase 2)
- **LPAREN**: `(` - Command substitution start
- **RPAREN**: `)` - Command substitution end

### Delimiters
- **NEWLINE**: Line terminator
- **WHITESPACE**: Space, tab (token separator, not emitted)
- **EOF**: End of input

### Comments
- **COMMENT**: Starts with `#` and continues to end of line
- Comments are only recognized at the beginning of a token (after whitespace or operators)
- `#` in the middle of a word is literal

## Supported Features

### Pipelines
```fish
ls | grep foo | sort
cat file.txt | tail -n 10
```

Semantics:
- Left-to-right execution
- Stream-based piping
- No background execution

### Command Substitution (Fish-style)
```fish
grep (cat patterns.txt) file.txt
```

Rules:
- Subcommand parsed as a full program
- Executed recursively
- Output trimmed, split on newlines
- Maximum recursion depth enforced

### Globbing
- `*` - Matches any characters (zero or more)
- `?` - Matches exactly one character
- `[abc]` - Matches any of a, b, c
- `[a-z]` - Matches any character in range
- `[!abc]` - Matches any character NOT in set

Behavior:
- Implemented via `fs.readdir`
- Happens after parsing, before execution
- No-match results in literal (fish behavior)
- Globs do NOT expand in quoted strings

```fish
cat *.txt
```

**NOT supported**: Recursive globbing (`**`)

### Quoting

#### Single Quotes (`'`)
```fish
grep 'foo bar'
```
- Preserves all characters literally
- No escape sequences
- No substitution
- Cannot contain single quotes

#### Double Quotes (`"`)
```fish
echo "files: (ls)"
```
- Allows command substitution
- **No variable expansion** (variables not supported)
- Minimal escaping: `\"` and `\\` only

### Escape Character (`\`)
Outside quotes:
- Backslash escapes the next character (removes special meaning)
- Line continuation when at end of line

In double quotes:
- `\"` → literal quote
- `\\` → literal backslash
- Other backslashes are literal

In single quotes:
- Backslash has no special meaning

### Redirection (Phase 2 - Optional)
```fish
cat file.txt > out.txt
```

Rules:
- File targets only
- No fd manipulation
- No append (`>>`) initially

## NOT Supported

### Variables
```fish
# NOT SUPPORTED
set x foo
echo $x
```
Rationale: Introduces scope and mutation, breaks determinism

### Brace Expansion
```fish
# NOT SUPPORTED
echo {a,b,c}
```

### Control Flow
NOT supported:
- `if`, `for`, `while`
- `switch`, `case`
- `begin` / `end`
- Function definitions

This is **not a scripting language**.

### Other Unsupported Features
- `;` (semicolons)
- `&` (background jobs)
- `&&`, `||` (logical operators)
- `and`, `or`, `not` (keywords)
- `~` (tilde expansion)
- `$()` syntax (use `()` instead)
- Heredocs
- Process substitution

## Grammar (Subset)

```ebnf
program      ::= pipeline
pipeline     ::= command ("|" command)*
command      ::= word+
word         ::= quoted | unquoted | substitution
quoted       ::= "'" .* "'" | '"' .* '"'
substitution ::= "(" program ")"
```

## Tokenization Rules

### Whitespace Handling
- Spaces and tabs separate tokens
- Multiple consecutive spaces treated as one separator
- Whitespace in quotes is preserved
- Line continuation: backslash at end of line

### Token Boundaries
Tokens are delimited by:
- Whitespace (space, tab, newline)
- Operators: `|`, `>`, `<`, `(`, `)`
- Quotes change to/from quoted mode but don't necessarily end tokens

### Concatenation
Adjacent tokens without whitespace are concatenated:
- `"quoted"unquoted` - Quoted and unquoted parts concatenate
- `'single'"double"` - Multiple quote types can concatenate

## Lexer State Machine

### States
1. **NORMAL**: Default state
2. **SINGLE_QUOTED**: Inside single quotes
3. **DOUBLE_QUOTED**: Inside double quotes
4. **COMMAND_SUB**: Inside command substitution `(...)`

### State Transitions
- `'` in NORMAL → SINGLE_QUOTED
- `'` in SINGLE_QUOTED → NORMAL
- `"` in NORMAL → DOUBLE_QUOTED
- `"` in DOUBLE_QUOTED → NORMAL
- `\` in NORMAL or DOUBLE_QUOTED → escape next char
- `(` in NORMAL or DOUBLE_QUOTED → COMMAND_SUB (increment depth)
- `#` at token start in NORMAL → COMMENT

## Error Model

### Parse Errors
- Unterminated quotes
- Invalid tokens
- Unmatched parentheses

### Runtime Errors
- Unknown command
- Filesystem failure
- Invalid glob (optional strict mode)

Errors are structured and surfaced to the host.

## Compatibility Contract

This tool guarantees:
- Fish-like syntax
- Fish-like glob behavior
- Fish-style command substitution

This tool does **not** guarantee:
- Script compatibility with fish
- Interactive shell behavior
- Environment or job semantics

## Implementation Notes

### Lookahead Requirements
- Command substitution requires matching parentheses (count depth)
- Character classes require matching brackets

### Error Recovery
- Report errors for unclosed quotes/parens
- Invalid escape sequences handled gracefully

### Unicode Support
- Full UTF-8 support
- String operations respect Unicode codepoints
