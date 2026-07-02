import { useMemo, useState } from 'react';
import { Shell } from 'shfs';
import { MemoryFS } from 'shfs/fs';
import { TerminalInput } from './terminal-input';

const TITLE = 'lawsonoates@macbook-pro: fish';

const BANNER = `
███████╗██╗  ██╗███████╗███████╗
██╔════╝██║  ██║██╔════╝██╔════╝
███████╗███████║█████╗  ███████╗
╚════██║██╔══██║██╔══╝  ╚════██║
███████║██║  ██║██║     ███████║
╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝

shfs — simulated fish shell for filesystem commands
`.trim();

const INTRO_LINES = BANNER.split('\n');

function splitText(text: string): string[] {
	if (text.trim().length === 0) {
		return [];
	}
	return text.split('\n');
}

export const Terminal = () => {
	const shell = useMemo(() => {
		return new Shell(new MemoryFS());
	}, []);

	const [historyLines, setHistoryLines] = useState<string[]>(INTRO_LINES);
	const [command, setCommand] = useState('');
	const [isRunning, setIsRunning] = useState(false);
	const [path, setPath] = useState('~');

	const handleSubmit = async () => {
		if (isRunning) {
			return;
		}

		const trimmedCommand = command.trim();
		if (trimmedCommand.length === 0) {
			setCommand('');
			return;
		}

		if (trimmedCommand === 'clear') {
			setHistoryLines([]);
			setCommand('');
			return;
		}

		const promptLine = `> ${command}`;
		setHistoryLines((previous) => [...previous, promptLine]);
		setCommand('');

		setIsRunning(true);
		try {
			const result = await shell.$`${trimmedCommand}`.nothrow();
			const stdoutLines = splitText(result.stdout.toString('utf8'));
			const stderrLines = splitText(result.stderr.toString('utf8'));
			const combinedLines = [...stdoutLines, ...stderrLines];
			if (combinedLines.length > 0) {
				setHistoryLines((previous) => [...previous, ...combinedLines]);
			}
		} catch {
			// Unknown shell failures still leave the prompt usable.
		} finally {
			try {
				const pwdResult = await shell.$`pwd`.nothrow();
				const currentPath = pwdResult.stdout.toString('utf8');
				setPath(currentPath || '~');
			} catch {
				// Keep the previous path if pwd fails.
			}
			setIsRunning(false);
		}
	};

	const output = historyLines.join('\n');

	return (
		<section
			aria-label="Ghostty terminal preview"
			className="terminal-resize h-[20rem] w-[94vw] resize overflow-hidden sm:h-[24rem] sm:w-[88vw] lg:h-[30rem] lg:w-[76vw]"
		>
			<div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1f1f1f] px-2.5 py-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
				<header className="flex items-center justify-between border-white/10">
					<div aria-hidden="true" className="flex items-center gap-2">
						<span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
						<span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
						<span className="h-3 w-3 rounded-full bg-[#27c93f]" />
					</div>
					<p className="text-white/70 text-xs tracking-wide">
						{TITLE}
					</p>
					<div aria-hidden="true" className="h-3 w-14" />
				</header>

				<div className="mt-4 flex min-h-0 flex-1 flex-col text-left">
					<div className="flex-1 overflow-y-auto pr-1">
						{output.length > 0 ? (
							<pre className="m-0 whitespace-pre-wrap break-words font-mono text-[#d8dee9] text-sm leading-6">
								{output}
							</pre>
						) : null}
					</div>
					<div className="mt-2">
						<TerminalInput
							disabled={isRunning}
							onSubmit={handleSubmit}
							onValueChange={setCommand}
							path={path}
							value={command}
						/>
					</div>
				</div>
			</div>
		</section>
	);
};
