import { MemoryFS } from './fs/memory';
import { ShellClient } from './shell/client';
import { $ as $dollar } from './shell/dollar';

const output = await $dollar`tail -n 10 logs.txt`.text();
console.log(output);

// Using ShellClient directly with custom fs
const fs = new MemoryFS();
fs.setFile(
	'logs.txt',
	Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n'),
);

const $ = new ShellClient(fs);
const output2 = await $.query`tail -n 10 logs.txt`.text();
console.log('\nUsing ShellClient with custom fs:');
console.log(output2);

const output3 = await $.query`ls *`.text();
console.log('\nUsing $ function with ls:');
console.log(output3);

// Test cp: copy logs.txt to backup.txt
await $.query`cp logs.txt backup.txt`.raw();
const output4 = await $.query`ls *`.text();
console.log('\nAfter cp logs.txt backup.txt:');
console.log(output4);

// Verify the copy worked
const output5 = await $.query`cat backup.txt`.text();
console.log('\nContents of backup.txt (first 5 lines):');
console.log(output5.split('\n').slice(0, 5).join('\n'));

// Test rm: delete backup.txt
console.log('\nDeleting backup.txt...');
await $.query`rm backup.txt`.raw();
const output6 = await $.query`ls *`.text();
console.log('After rm backup.txt:');
console.log(output6);
