import { expect, test } from 'bun:test';
import { compileSet } from '@/compile/command/set/set';
import { cmd, literal } from '@/ir';

test('set compiles global assignment', () => {
	expect(
		compileSet(
			cmd('set', [
				literal('-g'),
				literal('PROJECT_ROOT'),
				literal('/tmp'),
			])
		)
	).toEqual({
		cmd: 'set',
		args: {
			append: false,
			mode: 'assign',
			names: [literal('PROJECT_ROOT')],
			prepend: false,
			scope: 'global',
			values: [literal('/tmp')],
		},
	});
});

test('set compiles local assignment', () => {
	expect(
		compileSet(cmd('set', [literal('-l'), literal('LOCAL'), literal('x')]))
	).toEqual({
		cmd: 'set',
		args: {
			append: false,
			mode: 'assign',
			names: [literal('LOCAL')],
			prepend: false,
			scope: 'local',
			values: [literal('x')],
		},
	});
});

test('set compiles unscoped assignment to auto scope', () => {
	expect(compileSet(cmd('set', [literal('NAME'), literal('x')]))).toEqual({
		cmd: 'set',
		args: {
			append: false,
			mode: 'assign',
			names: [literal('NAME')],
			prepend: false,
			scope: 'auto',
			values: [literal('x')],
		},
	});
});

test('set compiles combined erase-global flags', () => {
	expect(compileSet(cmd('set', [literal('-eg'), literal('NAME')]))).toEqual({
		cmd: 'set',
		args: {
			append: false,
			mode: 'erase',
			names: [literal('NAME')],
			prepend: false,
			scope: 'global',
			values: [],
		},
	});
});

test('set compiles query mode', () => {
	expect(compileSet(cmd('set', [literal('-q'), literal('NAME')]))).toEqual({
		cmd: 'set',
		args: {
			append: false,
			mode: 'query',
			names: [literal('NAME')],
			prepend: false,
			scope: 'auto',
			values: [],
		},
	});
});
