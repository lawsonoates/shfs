import { openrouter } from '@openrouter/ai-sdk-provider';
import { generateText, stepCountIs, tool } from 'ai';
import { createCodeMode } from 'shfs/code-mode';
import { MemoryFS } from 'shfs/fs';
import { z } from 'zod';

const fs = new MemoryFS({ home: '/home/user' });
fs.setFile(
	'/home/user/lines.txt',
	Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n')
);

const codeMode = await createCodeMode(fs);

const codemodeTool = tool({
	description: `
		Use this tool to execute TypeScript code for filesystem-related tasks.

		Use normal Node.js filesystem APIs such as \`node:fs\` and
		\`node:fs/promises\`. Your files live in /home/user, which is also the
		working directory, so use paths like \`lines.txt\` or
		\`/home/user/lines.txt\`.

		The code must be an ES module. Export a default value or an async default
		function; the returned value will be reported back to you.
		`,
	execute: async ({ code }: { code: string }) => {
		console.log(`Executing code:\n${code}`);
		const result = await codeMode.exec(code);
		console.log(`Code result: ${JSON.stringify(result)}`);

		return result;
	},
	inputSchema: z.object({
		code: z.string().describe('The TypeScript code to execute'),
	}),
});

try {
	const { text } = await generateText({
		model: openrouter('anthropic/claude-haiku-4.5'),
		prompt: 'Read the contents of the file lines.txt and return the last 2 lines.',
		stopWhen: stepCountIs(2),
		tools: { codemode: codemodeTool },
	});

	console.log(text);
} finally {
	await codeMode.dispose();
}
