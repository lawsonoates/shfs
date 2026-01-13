/**
 * Lexer states for the fish subset lexer state machine.
 *
 * Simplified for the subset - only tracks quoting and command substitution.
 */
export const LexerState = {
	NORMAL: 0,
	SINGLE_QUOTED: 1, // Inside '...' - literal, no escapes
	DOUBLE_QUOTED: 2, // Inside "..." - command substitution allowed
	COMMAND_SUB: 3, // Inside (...) - command substitution
} as const;

export type LexerState = (typeof LexerState)[keyof typeof LexerState];

/**
 * Manages the lexer state stack for tracking nested contexts.
 *
 * Fish subset has simple quoting:
 * - Single quotes: literal, no escapes, no substitution
 * - Double quotes: command substitution allowed, minimal escaping (\", \\)
 */
export class StateContext {
	private stack: LexerState[] = [LexerState.NORMAL];

	/**
	 * Get the current lexer state.
	 */
	get current(): LexerState {
		return this.stack.at(-1) ?? LexerState.NORMAL;
	}

	/**
	 * Get the stack depth.
	 */
	get depth(): number {
		return this.stack.length;
	}

	/**
	 * Check if we're inside any quote context.
	 */
	get inQuotes(): boolean {
		const s = this.current;
		return s === LexerState.SINGLE_QUOTED || s === LexerState.DOUBLE_QUOTED;
	}

	/**
	 * Check if we're inside single quotes.
	 */
	get inSingleQuote(): boolean {
		return this.current === LexerState.SINGLE_QUOTED;
	}

	/**
	 * Check if we're inside double quotes.
	 */
	get inDoubleQuote(): boolean {
		return this.current === LexerState.DOUBLE_QUOTED;
	}

	/**
	 * Check if we're inside a command substitution.
	 */
	get inCommandSub(): boolean {
		return this.current === LexerState.COMMAND_SUB;
	}

	/**
	 * Push a new state onto the stack.
	 */
	push(state: LexerState): void {
		this.stack.push(state);
	}

	/**
	 * Pop the current state from the stack.
	 */
	pop(): LexerState {
		if (this.stack.length > 1) {
			return this.stack.pop() ?? LexerState.NORMAL;
		}
		return LexerState.NORMAL;
	}

	/**
	 * Reset the context to initial state.
	 */
	reset(): void {
		this.stack = [LexerState.NORMAL];
	}

	/**
	 * Check if any parent context is double-quoted.
	 * Useful for determining if command substitution should occur.
	 */
	hasDoubleQuoteParent(): boolean {
		return this.stack.includes(LexerState.DOUBLE_QUOTED);
	}

	/**
	 * Check if any parent context is single-quoted.
	 * If true, no expansions should occur.
	 */
	hasSingleQuoteParent(): boolean {
		return this.stack.includes(LexerState.SINGLE_QUOTED);
	}
}

/**
 * Tracks depth counters for nested constructs.
 */
export class DepthTracker {
	private parenDepth = 0;

	get paren(): number {
		return this.parenDepth;
	}

	enterParen(): void {
		this.parenDepth++;
	}

	exitParen(): boolean {
		if (this.parenDepth > 0) {
			this.parenDepth--;
			return true;
		}
		return false;
	}

	reset(): void {
		this.parenDepth = 0;
	}

	/**
	 * Check if we're at the top level (no nested constructs).
	 */
	isTopLevel(): boolean {
		return this.parenDepth === 0;
	}
}
