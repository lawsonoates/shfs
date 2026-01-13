# Fish Shell Parser - Modular Recursive Descent Implementation

## Overview
Create a **modular, recursive descent (LL-style) parser for Fish shell** inspired by the VC Parser architecture but with Fish shell semantics. The parser should:
- Use **clean separation of concerns** across multiple parser modules
- Implement **LL(1) predictive parsing** with single-token lookahead
- **Stream tokens** from a lexer (not pre-tokenized like Bash parser)
- Maintain **position tracking** for error reporting
- Build a complete **Abstract Syntax Tree (AST)** with visitor pattern support
- Handle Fish shell's unique syntax features (pipelines, redirections, functions, blocks)

## Target Language: Fish Shell

### Key Fish Shell Features to Support
1. **Commands & Pipelines**: `cmd1 | cmd2 | cmd3`
2. **Redirections**: `< file`, `> file`, `2>&1`, `&> file`
3. **Control Flow**: `if`, `else if`, `else`, `end`
4. **Loops**: `for x in list; end`, `while condition; end`
5. **Functions**: `function name; body; end`
6. **Blocks**: `begin; statements; end`
7. **Command Substitution**: `(cmd)` (Fish uses parens, not $())
8. **Variable Expansion**: `$var`, `$var[index]`, `{$var}` (Fish-style bracing)
9. **Operators**: `and`, `or`, `not` (keywords, not symbols)
10. **Builtins**: `set`, `builtin`, `switch`, `case` (pattern matching)

### Fish Shell Grammar (Simplified)
```
script              ::= statement*
statement           ::= pipeline [';' | '\n']
pipeline            ::= command ('|' command)*
command             ::= simple_command | compound_command
simple_command      ::= word* (redirection)* [&]
compound_command    ::= if_stmt | for_stmt | while_stmt | function_def | begin_block | switch_stmt
if_stmt             ::= 'if' pipeline 'then' statement* ('else if' pipeline 'then' statement*)* ('else' statement*)? 'end'
for_stmt            ::= 'for' variable 'in' word_list ';' statement* 'end'
while_stmt          ::= 'while' pipeline ';' statement* 'end'
begin_block         ::= 'begin' ';' statement* 'end'
function_def        ::= 'function' name [params]; statement* 'end'
switch_stmt         ::= 'switch' word 'case' pattern statement* ... 'end'
redirection         ::= ([fd])? (< | > | >> | &> | ^) word
word                ::= (literal | variable | command_sub | glob)*
variable            ::= '$' name | '$' name '[' expr ']'
command_sub         ::= '(' statement* ')'
```

## Architecture Requirements

### Module Structure
Create the following modules/classes:

1. **`TokenTypes.ts`** - Token type enum
   - Keywords: IF, THEN, ELSE, ELIF, END, FOR, WHILE, IN, FUNCTION, BEGIN, SWITCH, CASE, AND, OR, NOT, etc.
   - Literals: WORD, NUMBER, STRING
   - Operators: PIPE, SEMICOLON, AMP, REDIRECT_IN, REDIRECT_OUT, REDIRECT_APPEND, REDIRECT_STDERR, etc.
   - Special: NEWLINE, EOF

2. **`Token.ts`** - Token interface
   ```typescript
   interface Token {
     kind: TokenKind;
     spelling: string;
     position: SourcePosition;
   }
   
   interface SourcePosition {
     lineStart: number;
     charStart: number;
     lineFinish: number;
     charFinish: number;
   }
   ```

3. **`Lexer.ts`** - Tokenizer (streaming)
   - Returns one token at a time via `getToken(): Token`
   - Handles Fish shell escaping and quoting rules
   - Recognizes keywords vs words contextually
   - No pre-tokenization; maintains position state

4. **`AST.ts`** - AST node types
   - Base: `ASTNode` (abstract, with `position: SourcePosition`)
   - Program, Statement, Pipeline, Command
   - SimpleCommand, CompoundCommand variants (if, for, while, function, begin, switch)
   - Redirection, Word, WordPart (literal, variable, commandSub)
   - Implement **Visitor pattern**: each node has `accept(visitor: Visitor): T`

5. **`Parser.ts`** - Main parser class (core infrastructure only)
   - Properties: `scanner`, `errorReporter`, `currentToken`, `previousTokenPosition`
   - Methods: `match()`, `accept()`, `check()`, `advance()`, `start()`, `finish()`, `error()`
   - Delegates to sub-parsers: `statementParser`, `commandParser`, `expressionParser`, etc.
   - Entry point: `parseScript(): Program`

6. **`StatementParser.ts`** - Statement parsing
   - `parseStatement(): Statement | null`
   - `parsePipeline(): Pipeline`
   - Handles statement terminators (`;`, newlines, EOF)

7. **`CommandParser.ts`** - Command parsing
   - `parseCommand(): Command`
   - `parseSimpleCommand(): SimpleCommand`
   - `parseRedirection(): Redirection`
   - Identifies and dispatches to compound parsers

8. **`CompoundCommandParser.ts`** - Compound commands
   - `parseIfStatement(): IfStatement`
   - `parseForStatement(): ForStatement`
   - `parseWhileStatement(): WhileStatement`
   - `parseFunctionDef(): FunctionDef`
   - `parseBeginBlock(): BeginBlock`
   - `parseSwitchStatement(): SwitchStatement`

9. **`WordParser.ts`** - Word and expansion parsing
   - `parseWord(): Word`
   - `parseWordParts(): WordPart[]` (handles literals, variables, command substitutions)
   - `parseVariable(): VariablePart`
   - `parseCommandSubstitution(): CommandSubPart`
   - Handles Fish quoting rules

10. **`ErrorReporter.ts`** - Error handling
    - `reportError(message: string, position: SourcePosition): void`
    - `reportWarning(message: string, position: SourcePosition): void`

11. **`SyntaxError.ts`** - Exception class
    - Extends `Error`
    - Includes position information

### Implementation Style (Inspired by VC Parser)

**Position Tracking (like VC):**
```typescript
private start(position: SourcePosition): void {
  position.lineStart = this.currentToken.position.lineStart;
  position.charStart = this.currentToken.position.charStart;
}

private finish(position: SourcePosition): void {
  position.lineFinish = this.previousTokenPosition.lineFinish;
  position.charFinish = this.previousTokenPosition.charFinish;
}
```

**Token Matching (like VC):**
```typescript
private match(tokenExpected: TokenKind): void {
  if (this.currentToken.kind === tokenExpected) {
    this.previousTokenPosition = this.currentToken.position;
    this.currentToken = this.scanner.getToken();
  } else {
    this.syntacticError(`Expected ${tokenExpected}`, TokenKind[tokenExpected]);
  }
}
```

**Recursive Descent with LL(1):**
```typescript
// Disambiguation via lookahead
if (this.currentToken.kind === TokenKind.IF) {
  return this.compoundCommandParser.parseIfStatement();
} else if (this.currentToken.kind === TokenKind.FOR) {
  return this.compoundCommandParser.parseForStatement();
} else {
  return this.commandParser.parseSimpleCommand();
}
```

## Deliverables

1. **Directory Structure:**
   ```
   src/
     parser/
       TokenTypes.ts
       Token.ts
       Lexer.ts
       AST.ts
       Parser.ts (main orchestrator)
       StatementParser.ts
       CommandParser.ts
       CompoundCommandParser.ts
       WordParser.ts
       ErrorReporter.ts
       SyntaxError.ts
     test/
       lexer.test.ts
       parser.test.ts
   ```

2. **Each module should:**
   - Export all necessary types and classes
   - Have clear, documented function signatures
   - Include inline comments for Fish shell-specific behavior
   - Avoid circular dependencies (use dependency injection if needed)

3. **Visitor Pattern Implementation:**
   - Create `Visitor<T>` interface with `visit*` methods for each AST node type
   - Implement example: `PrintVisitor` (prints AST back to Fish code)

4. **Test Cases (minimum):**
   - Simple command: `echo hello`
   - Pipeline: `cat file | grep pattern | wc -l`
   - If statement: `if test -f file; echo found; end`
   - For loop: `for x in 1 2 3; echo $x; end`
   - Function: `function greet name; echo hello $name; end`
   - Command substitution: `echo (pwd)`
   - Variable expansion: `echo $HOME`, `echo $list[1]`
   - Redirections: `cat file > output.txt`, `cmd 2>&1`

5. **Error Handling:**
   - Report unexpected tokens with position info
   - Handle syntax errors gracefully
   - Include helpful error messages for common mistakes

## Fish Shell-Specific Considerations

1. **Newlines as Separators:** Unlike Bash, newlines terminate statements in Fish
2. **Keyword Arguments:** Fish uses keywords like `and`, `or`, `not` as boolean operators
3. **Pattern Matching:** `switch`/`case` uses glob patterns (not regex)
4. **Command Substitution Syntax:** `(cmd)` not `$(cmd)`
5. **Variable Scoping:** `set -l`, `set -g` hints (parse but don't enforce)
6. **No Word Splitting:** Fish doesn't split on whitespace by default
7. **Backslash Escaping:** Different rules than Bash (more like Python strings)

## Type Safety
- Use **TypeScript strict mode**
- Strong typing for all token kinds and AST nodes
- Use discriminated unions for AST variants
- No `any` types

## Code Quality
- Follow the **VC Parser's clean style**
- Keep functions focused and small
- Use clear, descriptive names
- Document public APIs with JSDoc comments
- Maintain consistency with VC Parser patterns (start/finish, match/accept, error handling)

## Success Criteria
✅ Parser successfully parses common Fish shell scripts
✅ Clear separation of concerns across modules
✅ Proper position tracking for all AST nodes
✅ Visitor pattern enables extensibility (pretty-printing, compilation, etc.)
✅ Single-token lookahead only (LL(1) style)
✅ Clean, educational code similar to VC Parser quality
✅ All tests pass
```

---

## How to Use This Prompt

1. **Copy the entire prompt above**
2. **Open Cursor and switch to Agent mode**
3. **Paste the prompt into the chat**
4. **Add any project-specific details** (e.g., "Use Jest for testing", "Target Node 18+")
5. **Let the agent generate the implementation**

The agent will understand:
- You want **modularity like a real project** but **clean simplicity like VC**
- You need **LL(1) single-token lookahead** (not complex multi-token like Bash)
- You want **Fish shell semantics**, not generic shell parsing
- Position tracking and visitor pattern are **non-negotiable**
- The result should be **educational yet production-ready**

```markdown
# Fish Shell Parser - Modular Recursive Descent Implementation

## Overview
Create a **modular, recursive descent (LL-style) parser for Fish shell** inspired by the VC Parser architecture but with Fish shell semantics. The parser should:
- Use **clean separation of concerns** across multiple parser modules
- Implement **LL(1) predictive parsing** with single-token lookahead
- **Stream tokens** from a lexer (not pre-tokenized like Bash parser)
- Maintain **position tracking** for error reporting
- Build a complete **Abstract Syntax Tree (AST)** with visitor pattern support
- Handle Fish shell's unique syntax features (pipelines, redirections, functions, blocks)

## Target Language: Fish Shell

### Key Fish Shell Features to Support
1. **Commands & Pipelines**: `cmd1 | cmd2 | cmd3`
2. **Redirections**: `< file`, `> file`, `2>&1`, `&> file`
3. **Control Flow**: `if`, `else if`, `else`, `end`
4. **Loops**: `for x in list; end`, `while condition; end`
5. **Functions**: `function name; body; end`
6. **Blocks**: `begin; statements; end`
7. **Command Substitution**: `(cmd)` (Fish uses parens, not $())
8. **Variable Expansion**: `$var`, `$var[index]`, `{$var}` (Fish-style bracing)
9. **Operators**: `and`, `or`, `not` (keywords, not symbols)
10. **Builtins**: `set`, `builtin`, `switch`, `case` (pattern matching)

### Fish Shell Grammar (Simplified)
```

```plaintext

## Architecture Requirements

### Module Structure
Create the following modules/classes:

1. **`TokenTypes.ts`** - Token type enum
   - Keywords: IF, THEN, ELSE, ELIF, END, FOR, WHILE, IN, FUNCTION, BEGIN, SWITCH, CASE, AND, OR, NOT, etc.
   - Literals: WORD, NUMBER, STRING
   - Operators: PIPE, SEMICOLON, AMP, REDIRECT_IN, REDIRECT_OUT, REDIRECT_APPEND, REDIRECT_STDERR, etc.
   - Special: NEWLINE, EOF

2. **`Token.ts`** - Token interface
   interface Token {
     kind: TokenKind;
     spelling: string;
     position: SourcePosition;
   }
   
   interface SourcePosition {
     lineStart: number;
     charStart: number;
     lineFinish: number;
     charFinish: number;
   }
   3. **`Lexer.ts`** - Tokenizer (streaming)
   - Returns one token at a time via `getToken(): Token`
   - Handles Fish shell escaping and quoting rules
   - Recognizes keywords vs words contextually
   - No pre-tokenization; maintains position state

4. **`AST.ts`** - AST node types
   - Base: `ASTNode` (abstract, with `position: SourcePosition`)
   - Program, Statement, Pipeline, Command
   - SimpleCommand, CompoundCommand variants (if, for, while, function, begin, switch)
   - Redirection, Word, WordPart (literal, variable, commandSub)
   - Implement **Visitor pattern**: each node has `accept(visitor: Visitor): T`

5. **`Parser.ts`** - Main parser class (core infrastructure only)
   - Properties: `scanner`, `errorReporter`, `currentToken`, `previousTokenPosition`
   - Methods: `match()`, `accept()`, `check()`, `advance()`, `start()`, `finish()`, `error()`
   - Delegates to sub-parsers: `statementParser`, `commandParser`, `expressionParser`, etc.
   - Entry point: `parseScript(): Program`

6. **`StatementParser.ts`** - Statement parsing
   - `parseStatement(): Statement | null`
   - `parsePipeline(): Pipeline`
   - Handles statement terminators (`;`, newlines, EOF)

7. **`CommandParser.ts`** - Command parsing
   - `parseCommand(): Command`
   - `parseSimpleCommand(): SimpleCommand`
   - `parseRedirection(): Redirection`
   - Identifies and dispatches to compound parsers

8. **`CompoundCommandParser.ts`** - Compound commands
   - `parseIfStatement(): IfStatement`
   - `parseForStatement(): ForStatement`
   - `parseWhileStatement(): WhileStatement`
   - `parseFunctionDef(): FunctionDef`
   - `parseBeginBlock(): BeginBlock`
   - `parseSwitchStatement(): SwitchStatement`

9. **`WordParser.ts`** - Word and expansion parsing
   - `parseWord(): Word`
   - `parseWordParts(): WordPart[]` (handles literals, variables, command substitutions)
   - `parseVariable(): VariablePart`
   - `parseCommandSubstitution(): CommandSubPart`
   - Handles Fish quoting rules

10. **`ErrorReporter.ts`** - Error handling
    - `reportError(message: string, position: SourcePosition): void`
    - `reportWarning(message: string, position: SourcePosition): void`

11. **`SyntaxError.ts`** - Exception class
    - Extends `Error`
    - Includes position information

### Implementation Style (Inspired by VC Parser)

**Position Tracking (like VC):**
private start(position: SourcePosition): void {
  position.lineStart = this.currentToken.position.lineStart;
  position.charStart = this.currentToken.position.charStart;
}

private finish(position: SourcePosition): void {
  position.lineFinish = this.previousTokenPosition.lineFinish;
  position.charFinish = this.previousTokenPosition.charFinish;
}**Token Matching (like VC):**
private match(tokenExpected: TokenKind): void {
  if (this.currentToken.kind === tokenExpected) {
    this.previousTokenPosition = this.currentToken.position;
    this.currentToken = this.scanner.getToken();
  } else {
    this.syntacticError(`Expected ${tokenExpected}`, TokenKind[tokenExpected]);
  }
}**Recursive Descent with LL(1):**
// Disambiguation via lookahead
if (this.currentToken.kind === TokenKind.IF) {
  return this.compoundCommandParser.parseIfStatement();
} else if (this.currentToken.kind === TokenKind.FOR) {
  return this.compoundCommandParser.parseForStatement();
} else {
  return this.commandParser.parseSimpleCommand();
}## Deliverables

1. **Directory Structure:**
   
```

```plaintext

2. **Each module should:**
   - Export all necessary types and classes
   - Have clear, documented function signatures
   - Include inline comments for Fish shell-specific behavior
   - Avoid circular dependencies (use dependency injection if needed)

3. **Visitor Pattern Implementation:**
   - Create `Visitor<T>` interface with `visit*` methods for each AST node type
   - Implement example: `PrintVisitor` (prints AST back to Fish code)

4. **Test Cases (minimum):**
   - Simple command: `echo hello`
   - Pipeline: `cat file | grep pattern | wc -l`
   - If statement: `if test -f file; echo found; end`
   - For loop: `for x in 1 2 3; echo $x; end`
   - Function: `function greet name; echo hello $name; end`
   - Command substitution: `echo (pwd)`
   - Variable expansion: `echo $HOME`, `echo $list[1]`
   - Redirections: `cat file > output.txt`, `cmd 2>&1`

5. **Error Handling:**
   - Report unexpected tokens with position info
   - Handle syntax errors gracefully
   - Include helpful error messages for common mistakes

## Fish Shell-Specific Considerations

1. **Newlines as Separators:** Unlike Bash, newlines terminate statements in Fish
2. **Keyword Arguments:** Fish uses keywords like `and`, `or`, `not` as boolean operators
3. **Pattern Matching:** `switch`/`case` uses glob patterns (not regex)
4. **Command Substitution Syntax:** `(cmd)` not `$(cmd)`
5. **Variable Scoping:** `set -l`, `set -g` hints (parse but don't enforce)
6. **No Word Splitting:** Fish doesn't split on whitespace by default
7. **Backslash Escaping:** Different rules than Bash (more like Python strings)

## Type Safety
- Use **TypeScript strict mode**
- Strong typing for all token kinds and AST nodes
- Use discriminated unions for AST variants
- No `any` types

## Code Quality
- Follow the **VC Parser's clean style**
- Keep functions focused and small
- Use clear, descriptive names
- Document public APIs with JSDoc comments
- Maintain consistency with VC Parser patterns (start/finish, match/accept, error handling)

## Success Criteria
✅ Parser successfully parses common Fish shell scripts
✅ Clear separation of concerns across modules
✅ Proper position tracking for all AST nodes
✅ Visitor pattern enables extensibility (pretty-printing, compilation, etc.)
✅ Single-token lookahead only (LL(1) style)
✅ Clean, educational code similar to VC Parser quality
✅ All tests pass
```