import { Shell } from 'shfs';
import { TursoAgentFS } from './fs';

const fs = await TursoAgentFS.create('my-agent');
await fs.writeFile('hello.txt', new TextEncoder().encode('Hello, world!'));

const { $ } = new Shell(fs);

const result = await $`cat hello.txt`.text();
console.log(result);
