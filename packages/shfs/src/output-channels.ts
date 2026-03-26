import type { Record as StdoutRecord } from './record';

export interface OutputChannels<TStdout = StdoutRecord> {
	stdout: readonly TStdout[];
	stderr: readonly string[];
	exitCode: number;
}

export type ExecuteOutput = OutputChannels;
export type ShellCommandResult = OutputChannels;
