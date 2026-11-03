import { readFileSync } from 'node:fs';

interface OwnPackage {
  version: string;
  repository?: string | { url?: string };
}

function ownPackage(): OwnPackage {
  return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
}

export function packageVersion(): string {
  return ownPackage().version;
}

/** Where dnw is installed from: the GitHub repo in package.json, as an npm install spec. */
export function installSource(): string {
  const repo = ownPackage().repository;
  const url = typeof repo === 'string' ? repo : (repo?.url ?? '');
  const m = /github(?:\.com[:/]|:)([^/]+\/[^/.#]+)/.exec(url);
  return m ? `github:${m[1]}` : 'dev-nickole-workflow';
}

/** Install command matching how a project runs dnw: a dev dependency for npx, otherwise global. */
export function installCommand(dnwCommand: string): string {
  return `npm i ${dnwCommand.startsWith('npx') ? '-D' : '-g'} ${installSource()}`;
}
