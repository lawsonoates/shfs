#!/bin/bash
set -euo pipefail

bun --no-install --eval '
import { Parser } from "./packages/compiler/src/parser/parser";
import { compile } from "./packages/compiler/src/compile/compile";
import { Scanner } from "./packages/compiler/src/lexer/scanner";

const repeat = 45;
const samples = 9;
const scripts = [];
for (let i = 0; i < repeat; i++) {
  scripts.push(`# file ${i}\nls src packages test | grep \".${i % 7}\" > out-${i}.txt\ncat < input-${i}.txt | sort | uniq >> results.txt\necho prefix-${i}-*.ts (pwd) ${i}\nand find packages -name \"*.ts\" | grep compiler\nor echo fallback-${i}\n`);
}
const workload = scripts.join("\n");

function timeOnce() {
  const parseStart = performance.now();
  const program = new Parser(workload).parse();
  const parseMs = performance.now() - parseStart;
  const compileStart = performance.now();
  compile(program);
  const compileMs = performance.now() - compileStart;
  return { parseMs, compileMs, totalMs: parseMs + compileMs, statements: program.statements.length };
}

function tokenCount() {
  const scanner = new Scanner(workload);
  let count = 0;
  while (true) {
    count++;
    if (scanner.getToken().kind === 0) {
      return count;
    }
  }
}

// Warm up JIT and module paths.
for (let i = 0; i < 20; i++) timeOnce();

const runs = [];
for (let i = 0; i < samples; i++) runs.push(timeOnce());
runs.sort((a, b) => a.totalMs - b.totalMs);
const median = runs[Math.floor(runs.length / 2)];

console.log(`METRIC total_ms=${median.totalMs.toFixed(4)}`);
console.log(`METRIC parse_ms=${median.parseMs.toFixed(4)}`);
console.log(`METRIC compile_ms=${median.compileMs.toFixed(4)}`);
console.log(`METRIC tokens=${tokenCount()}`);
console.log(`METRIC statements=${median.statements}`);
'
