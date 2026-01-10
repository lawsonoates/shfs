export type PipelineIR = {
	source: SourceIR;
	steps: StepIR[];
};

export type SourceIR = { kind: 'fs'; glob: string } | { kind: 'stdin' };

export type StepIR =
	| { cmd: 'cat'; args: { files: string[] } }
	| { cmd: 'cp'; args: { srcs: string[]; dest: string; recursive: boolean } }
	| { cmd: 'ls'; args: { paths: string[] } }
	| { cmd: 'pwd'; args: Record<string, never> }
	| { cmd: 'rm'; args: { paths: string[]; recursive: boolean } }
	| { cmd: 'tail'; args: { n: number; files: string[] } };
