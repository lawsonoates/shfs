import { type FormEvent, useEffect, useRef } from 'react';

export const TerminalInput = ({
	path,
	value,
	disabled = false,
	onSubmit,
	onValueChange,
}: {
	path: string;
	value: string;
	disabled?: boolean;
	onSubmit: () => void;
	onValueChange: (value: string) => void;
}) => {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!disabled) {
			inputRef.current?.focus();
		}
	}, [disabled]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		onSubmit();
	};

	return (
		<form
			aria-label="Terminal command input"
			className="flex w-full items-center gap-2 font-mono text-[#d8dee9] text-sm leading-6"
			onSubmit={handleSubmit}
		>
			<span className="shrink-0 text-[#7aa2f7]">{path}</span>
			<span className="shrink-0 text-[#d8dee9]">&gt;</span>
			<input
				autoFocus
				className="w-full border-none bg-transparent p-0 text-[#d8dee9] outline-none"
				disabled={disabled}
				onChange={(event) => onValueChange(event.currentTarget.value)}
				ref={inputRef}
				spellCheck={false}
				type="text"
				value={value}
			/>
		</form>
	);
};
