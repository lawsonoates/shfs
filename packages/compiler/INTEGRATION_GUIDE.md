# Integration Guide: AST-Based Parser with Enhanced IR

This document outlines all changes needed to integrate the new AST-based parser with an enhanced IR that preserves word expansion information.

## Architecture Overview

```
Input String
    ↓
[Lexer] → Tokens
    ↓
[Parser] → Program (AST)
    ↓
[Compiler] → PipelineIR (enhanced)
    ↓
[Executor] → ExecuteResult (stream/sink)
```

The key difference from the current implementation:
- **Old**: Simple string-based parsing → flat `ShellCommand` objects → direct execution
- **New**: AST-based parsing → structured `Program` → rich `PipelineIR` → execution

## File Changes

### 1. `/packages/compiler/src/ir.ts` - MAJOR CHANGES

**Add new types to represent expanded words:**

```typescript
// Types representing the result of word expansion
export type ExpandedWord = 
	| { kind: 'literal'; value: string }
	| { kind: 'glob'; pattern: string; expanded: string[] }
	| { kind: 'commandSub'; command: string; output: string[] };

export interface SimpleCommandIR {
	name: ExpandedWord;
	args: ExpandedWord[];
	redirections: RedirectionIR[];
}

export interface RedirectionIR {
	kind: 'input' | 'output';
	target: ExpandedWord;
}
```

**Update existing step interfaces to use `ExpandedWord[]` instead of `string[]`:**

```typescript
// Before:
export interface CatStep {
	cmd: 'cat';
	args: {
		files: string[];
		numberLines?: boolean;
		// ...
	};
}

// After:
export interface CatStep {
	cmd: 'cat';
	args: {
		files: ExpandedWord[];
		numberLines?: boolean;
		// ...
	};
}
```

**Apply to all step types:**
- `CpStep`: `srcs: ExpandedWord[]`, `dest: ExpandedWord`
- `HeadStep`: `files: ExpandedWord[]`
- `LsStep`: `paths: ExpandedWord[]`
- `MkdirStep`: `paths: ExpandedWord[]`
- `MvStep`: `srcs: ExpandedWord[]`, `dest: ExpandedWord`
- `RmStep`: `paths: ExpandedWord[]`
- `TailStep`: `files: ExpandedWord[]`
- `TouchStep`: `files: ExpandedWord[]`

**Update `PipelineIR`:**

```typescript
// Before:
export interface PipelineIR {
	source: SourceIR;
	steps: StepIR[];
}

// After - keep source but also add the command structure:
export interface PipelineIR {
	source: SourceIR;
	steps: StepIR[];
	// Store the first command for reference (may include globs, command subs)
	firstCommand?: SimpleCommandIR;
}
```

### 2. `/packages/compiler/src/compile/compile.ts` - COMPLETE REWRITE

Replace the current implementation with a visitor pattern that:
1. Accepts `Program` from the parser (not `ShellAST`)
2. Implements the `Visitor<PipelineIR>` interface from the AST
3. Converts `Word` objects to `ExpandedWord[]` 
4. Delegates to command handlers with the new signature

```typescript
import type { Visitor, Program, SimpleCommand, Word, WordPart, Redirection } from '../parser/ast';
import type { PipelineIR, SimpleCommandIR, StepIR, ExpandedWord, RedirectionIR } from '../ir';
import { CommandHandler } from './command/handler';

export function compile(program: Program): PipelineIR {
	const compiler = new ProgramCompiler();
	return program.accept(compiler);
}

class ProgramCompiler implements Visitor<PipelineIR> {
	visitProgram(node: Program): PipelineIR {
		return node.pipeline.accept(this);
	}

	visitPipeline(node: Pipeline): PipelineIR {
		const commands: SimpleCommandIR[] = node.commands.map((cmd) =>
			cmd.accept(this) as SimpleCommandIR
		);

		if (commands.length === 0) {
			throw new Error('Pipeline must contain at least one command');
		}

		// First command determines the source
		const firstCmd = commands[0];
		const source = this.determineSource(firstCmd);

		// Compile each command to a step
		const steps: StepIR[] = commands.map((cmd) =>
			this.compileCommandToStep(cmd)
		);

		return {
			source,
			steps,
			firstCommand: commands[0],
		};
	}

	visitSimpleCommand(node: SimpleCommand): SimpleCommandIR {
		return {
			name: this.expandWord(node.name),
			args: node.args.map((arg) => this.expandWord(arg)),
			redirections: node.redirections.map((r) => r.accept(this) as RedirectionIR),
		};
	}

	visitRedirection(node: Redirection): RedirectionIR {
		return {
			kind: node.redirectKind,
			target: this.expandWord(node.target),
		};
	}

	visitWord(node: Word): ExpandedWord[] {
		// This is called during word expansion
		return node.parts.map((part) => this.expandWordPart(part));
	}

	visitLiteralPart(node: LiteralPart): ExpandedWord {
		return { kind: 'literal', value: node.value };
	}

	visitGlobPart(node: GlobPart): ExpandedWord {
		// At compile time, we can't expand globs (no FS access)
		// Store the pattern; executor will expand it
		return { kind: 'glob', pattern: node.pattern, expanded: [] };
	}

	visitCommandSubPart(node: CommandSubPart): ExpandedWord {
		// At compile time, we can't execute command substitution
		// Store it for runtime evaluation
		// For now, we store the pattern; executor needs to handle this
		return {
			kind: 'commandSub',
			command: 'not-yet-compiled',
			output: [],
		};
	}

	// Helper methods

	private expandWord(word: Word): ExpandedWord {
		// If word has only literal parts, create a single literal
		if (word.parts.length === 1) {
			const part = word.parts[0];
			if (part.kind === 'literal') {
				return { kind: 'literal', value: (part as any).value };
			}
		}

		// If word has only literals, concatenate them
		const allLiterals = word.parts.every((p) => p.kind === 'literal');
		if (allLiterals) {
			const value = word.parts
				.map((p) => (p as any).value)
				.join('');
			return { kind: 'literal', value };
		}

		// Mixed: need to preserve the structure
		// For now, if it contains globs/subs, we need special handling
		// This is complex - see note below
		return { kind: 'literal', value: 'TODO' };
	}

	private expandWordPart(part: WordPart): ExpandedWord {
		return part.accept?.(this) ?? ({ kind: 'literal', value: '' } as any);
	}

	private determineSource(firstCmd: SimpleCommandIR) {
		// Convention: first command determines source
		// For now, always use 'fs' with the first argument as glob
		const firstArg = firstCmd.args[0];
		if (firstArg?.kind === 'literal') {
			return {
				kind: 'fs' as const,
				glob: firstArg.value,
			};
		}
		return { kind: 'fs' as const, glob: '**/*' };
	}

	private compileCommandToStep(cmd: SimpleCommandIR): StepIR {
		const cmdName = this.extractLiteralString(cmd.name);
		if (!cmdName) {
			throw new Error('Command name must be a literal string');
		}

		const handler = CommandHandler.get(cmdName);
		return handler(cmd);
	}

	private extractLiteralString(word: ExpandedWord): string | null {
		if (word.kind === 'literal') {
			return word.value;
		}
		return null;
	}
}
```

### 3. `/packages/compiler/src/compile/command/handler.ts` - UPDATE SIGNATURE

Change the handler type and update all command references:

```typescript
import type { SimpleCommandIR } from '../../ir';
import type { StepIR } from '../../ir';

// Update the handler signature
export type Handler = (cmd: SimpleCommandIR) => StepIR;

export namespace CommandHandler {
	const handlers: Record<string, Handler> = {
		cat: compileCat,
		cp: compileCp,
		head: compileHead,
		ls: compileLs,
		mkdir: compileMkdir,
		mv: compileMv,
		rm: compileRm,
		tail: compileTail,
		touch: compileTouch,
	};

	export function get(name: string): Handler {
		const handler = handlers[name];
		if (!handler) {
			throw new Error(`Unknown command: ${name}`);
		}
		return handler;
	}
}
```

### 4. `/packages/compiler/src/compile/command/[cmd]/[cmd].ts` - UPDATE ALL HANDLERS

Each handler needs to be updated to work with `SimpleCommandIR` and extract values from `ExpandedWord[]`.

Example for `cat.ts`:

```typescript
import type { SimpleCommandIR } from '../../../ir';
import type { StepIR } from '../../../ir';
import type { Flag } from '../arg/flag';

const flags: Record<string, Flag> = {
	// ... existing flags
};

// Helper to convert ExpandedWord to string
function expandedWordToString(word: any): string {
	if (word.kind === 'literal') {
		return word.value;
	}
	if (word.kind === 'glob') {
		// For now, return the pattern; executor will expand
		return word.pattern;
	}
	return '';
}

export function compileCat(cmd: SimpleCommandIR): StepIR {
	// Convert ExpandedWord[] to string[] for arg parsing
	const argStrings = cmd.args.map(expandedWordToString);

	const parsed = parseArgs(argStrings, flags);

	const files = parsed.positional;
	if (files.length === 0) {
		throw new Error('cat requires at least one file');
	}

	// Store expanded words, not just strings
	return {
		args: {
			files: cmd.args.filter((_, i) => {
				// Keep only positional arguments (not flags)
				const argStr = expandedWordToString(cmd.args[i]);
				return !argStr.startsWith('-');
			}),
			numberLines: parsed.flags.number === true,
			numberNonBlank: parsed.flags.numberNonBlank === true,
			showAll: parsed.flags.showAll === true,
			showEnds: parsed.flags.showEnds === true,
			showNonprinting: parsed.flags.showNonprinting === true,
			showTabs: parsed.flags.showTabs === true,
			squeezeBlank: parsed.flags.squeezeBlank === true,
		},
		cmd: 'cat',
	} as const;
}
```

Apply similar patterns to all handlers:
- `cp.ts`: Extract `srcs` and `dest` from `ExpandedWord[]`
- `head.ts`: Extract `n` (number) and `files`
- `ls.ts`: Extract `paths`
- `mkdir.ts`: Extract `paths` and `recursive` flag
- `mv.ts`: Extract `srcs` and `dest`
- `rm.ts`: Extract `paths` and `recursive` flag
- `tail.ts`: Extract `n` and `files`
- `touch.ts`: Extract `files`

### 5. `/packages/compiler/src/parser.ts` - REPLACE WITH NEW PARSER

Replace the old string-based parser with exports from the new parser module:

```typescript
export { parse, Parser } from './parser/parser';
export type { Program } from './parser/ast';
```

### 6. `/packages/compiler/src/ast.ts` - DEPRECATE OR REMOVE

The old `ShellAST` type is no longer used. Options:
- Keep it for backward compatibility (mark as deprecated)
- Remove it entirely and update imports in vsh package

Recommendation: **Keep for now but add deprecation comment**

```typescript
/**
 * @deprecated Use Program from parser/ast.ts instead
 */
export interface ShellCommand {
	name: string;
	args: string[];
}

/**
 * @deprecated Use Program from parser/ast.ts instead
 */
export interface ShellAST {
	commands: ShellCommand[];
}
```

### 7. `/packages/vsh/src/shell/shell.ts` - UPDATE IMPORTS

```typescript
// Change from:
import { compile } from '@vsh/compiler/compile';
import { parse } from '@vsh/compiler/parser';

// To:
import { compile, parse } from '@vsh/compiler';
```

The compiler package needs to export these. Add an `index.ts`:

### 8. `/packages/compiler/src/index.ts` - CREATE NEW FILE

Create a public API that re-exports the key types and functions:

```typescript
// Parser exports
export { parse, Parser } from './parser/parser';
export type { Program, Pipeline, SimpleCommand, Word } from './parser/ast';

// Compiler exports
export { compile } from './compile/compile';

// IR exports
export type {
	PipelineIR,
	StepIR,
	SourceIR,
	ExpandedWord,
	SimpleCommandIR,
	RedirectionIR,
	CatStep,
	CpStep,
	HeadStep,
	LsStep,
	MkdirStep,
	MvStep,
	RmStep,
	TailStep,
	TouchStep,
} from './ir';
```

### 9. `/packages/vsh/src/execute/execute.ts` - HANDLE EXPANDED WORDS

Update to work with `ExpandedWord` types:

```typescript
import type { ExpandedWord } from '@vsh/compiler/ir';

// Helper function to extract strings from ExpandedWord
function extractPathsFromExpandedWords(words: ExpandedWord[]): string[] {
	return words.flatMap((word) => {
		if (word.kind === 'literal') {
			return [word.value];
		}
		if (word.kind === 'glob') {
			// Executor has FS access, so expand globs here
			return word.expanded; // Already expanded by this point
		}
		if (word.kind === 'commandSub') {
			return word.output;
		}
		return [];
	});
}

// Update each case to use this helper:
case 'cat':
	return {
		kind: 'stream',
		value: pipe(
			files(...extractPathsFromExpandedWords(step.args.files)),
			cat(fs)
		),
	};

// Similar for all other cases
```

**Note**: Glob expansion needs to happen before `execute()` is called, OR during execution. This is a separate concern to address.

## Implementation Phases

### Phase 1: Update IR and Compiler
1. ✅ Update `/ir.ts` with `ExpandedWord` type
2. ✅ Rewrite `/compile/compile.ts` with visitor pattern
3. ✅ Update `/compile/command/handler.ts` signature
4. ✅ Update all command handlers

### Phase 2: Update Package Exports
5. ✅ Create `/index.ts` for public API
6. ✅ Update `/parser.ts` to export new parser
7. ✅ Update vsh package imports

### Phase 3: Handle Word Expansion at Runtime
8. ⏳ Decide on glob expansion strategy:
   - Option A: Expand globs in executor before calling `execute()`
   - Option B: Add a preprocessing step that expands globs before IR is created
   - Option C: Expand globs during command handler invocation
9. ⏳ Update `execute()` to handle `ExpandedWord` types
10. ⏳ Handle command substitution execution

### Phase 4: Testing and Integration
11. ⏳ Write tests for new compiler
12. ⏳ Test end-to-end with shell
13. ⏳ Handle edge cases

## Key Design Decisions

### 1. When to Expand Words?

**Current approach**: Store word structure in IR, expand at executor time

**Rationale**:
- Compiler has no FS access (can't expand globs)
- Executor has FS, can expand as needed
- Preserves information for error messages and debugging

### 2. Handling Complex Words

Example: `foo*.txt` (literal + glob + literal)

**Current approach**: Store as separate `ExpandedWord` items in an array

**Issue**: Need to handle this during expansion

```typescript
// Input: Word with parts: [Literal("foo"), Glob("*"), Literal(".txt")]
// Should produce: ExpandedWord for each matching file, e.g.:
// - Literal("foo123.txt")
// - Literal("foo456.txt")
```

**TODO**: Implement proper handling in executor

### 3. Command Substitution

Example: `cat (ls)` (command substitution in argument)

**Current approach**: Store as `commandSub` in IR

**TODO**: Implement recursive compilation and execution

## Migration Checklist

- [ ] Update `ir.ts` with `ExpandedWord` type
- [ ] Implement visitor pattern in `compile.ts`
- [ ] Update all command handlers
- [ ] Update `handler.ts` signature
- [ ] Create `index.ts` exports
- [ ] Update `parser.ts` exports
- [ ] Update vsh package imports in `shell.ts`
- [ ] Update `execute.ts` to handle `ExpandedWord`
- [ ] Implement glob expansion in executor
- [ ] Write tests for new flow
- [ ] Handle complex words (glob patterns in middle of literals)
- [ ] Handle command substitution

## Questions and TODOs

1. **Glob expansion timing**: When should globs be expanded?
   - During compilation? (No FS access)
   - During execution? (Need to pass FS through IR)
   - As a preprocessing step? (Separate phase)

2. **Complex word handling**: How to handle `foo*.txt`?
   - Should result in multiple matched files, or a single word?
   - How does this interact with flags?

3. **Command substitution**: When should `(...)` be evaluated?
   - At compile time? (Need to execute during compilation)
   - At execution time? (Need to store command for later execution)

4. **Error handling**: How to preserve error locations?
   - Use source spans from parser
   - Include in IR for better error messages
