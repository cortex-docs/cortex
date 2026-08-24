#!/usr/bin/env node

const base = process.env.PR_BASE;
const head = process.env.PR_HEAD;

if (!base && !head) {
  console.log('This event is not a pull request.');
  process.exit(0);
}

if (!base || !head) throw new Error('The pull request branch data is incomplete.');
if (base === 'main' && head !== 'pre-release') {
  throw new Error('Only the pre-release branch can open a pull request to main.');
}
if (base !== 'main' && base !== 'pre-release') {
  throw new Error('Pull requests must target pre-release or main.');
}

console.log(`The ${head} -> ${base} promotion path is valid.`);
