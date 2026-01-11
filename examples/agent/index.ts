import { openrouter } from '@openrouter/ai-sdk-provider';
import { Shell } from '@vsh/vsh/client';
import { MemoryFS } from '@vsh/vsh/memory';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const fs = new MemoryFS();
fs.setFile(
	'/lines.txt',
	Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n'),
);

const { $ } = new Shell(fs);

const bashTool = tool({
	description: 'Execute bash commands',
	execute: async ({ command }: { command: string }) => {
		console.log(`Executing command: ${command}`);
		try {
			const result = await $`${command}`.text();
			console.log(`Command output: ${result}`);
			return {
				output: result,
			};
		} catch (error) {
			console.error(`Error executing command: ${error}`);
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
	inputSchema: z.object({
		command: z.string().describe('The bash command to execute'),
	}),
});

const { text } = await generateText({
	model: openrouter('anthropic/claude-haiku-4.5'),
	prompt:
		'Read the contents of the file /lines.txt and return the last 2 lines.',
	stopWhen: stepCountIs(2),
	tools: { bash: bashTool },
});

console.log(text);
