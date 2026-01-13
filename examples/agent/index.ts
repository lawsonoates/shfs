import { openrouter } from '@openrouter/ai-sdk-provider';
import { generateText, stepCountIs, tool } from 'ai';
import { Shell } from 'shfs';
import { MemoryFS } from 'shfs/fs';
import { z } from 'zod';

const fs = new MemoryFS();
fs.setFile(
	'/lines.txt',
	Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n')
);

const { $ } = new Shell(fs);

const bashTool = tool({
	description: `
		Use this tool to execute filesystem-related fish shell commands.

		--
		
		Strict fish-inspired subset for filesystem commands. Not POSIX, not full fish. Deterministic, stream-based, no ambient state.

		**Commands**: \`cat\`, \`cp\`, \`head\`, \`ls\`, \`mkdir\`, \`mv\`, \`rm\`, \`tail\`, \`touch\` (built-ins only, no external binaries, no \`$PATH\`)

		## Supported

		- **Pipelines**: \`|\` only, left-to-right, stream-based
		- **Quoting**: Single \`'\` (literal, no escapes), double \`"\` (allows \`(command)\` substitution, escapes \`\\"\` and \`\\\\\` only)
		- **Escapes**: \`\\\` escapes next char outside quotes, line continuation at EOL; literal in single quotes
		- **Command substitution**: \`(command)\` syntax (NOT \`$()\`), recursive, output trimmed/split on newlines
		- **Globbing**: \`*\`, \`?\`, \`[abc]\`, \`[a-z]\`, \`[!abc]\` (no expansion in quotes, no-match = literal)
		- **Comments**: \`#\` to EOL (only at token start)

		## Not Supported

		- Variables (\`set\`, \`$x\`), recursive globs (\`**\`), brace expansion
		- Redirection (\`<\`, \`>\`)
		- Control flow (\`if\`, \`for\`, \`while\`, \`switch\`, functions)
		- \`;\`, \`&\`, \`&&\`/\`||\`, \`and\`/\`or\`/\`not\`, \`~\`, \`$()\`, heredocs, process substitution
		`,
	execute: async ({ command }: { command: string }) => {
		console.log(`Executing command: ${command}`);
		const result = await $`${command}`.text();
		console.log(`Command output: ${result}`);

		return {
			output: result,
		};
	},
	inputSchema: z.object({
		command: z.string().describe('The bash command to execute'),
	}),
});

const { text } = await generateText({
	model: openrouter('anthropic/claude-haiku-4.5'),
	prompt: 'Read the contents of the file /lines.txt and return the last 2 lines.',
	stopWhen: stepCountIs(2),
	tools: { bash: bashTool },
});

console.log(text);
