import { readFileSync } from 'node:fs';
function ownPackage() {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
}
export function packageVersion() {
    return ownPackage().version;
}
/** Where dnw is installed from: the GitHub repo in package.json, as an npm install spec. */
export function installSource() {
    const repo = ownPackage().repository;
    const url = typeof repo === 'string' ? repo : (repo?.url ?? '');
    const m = /github(?:\.com[:/]|:)([^/]+\/[^/.#]+)/.exec(url);
    return m ? `github:${m[1]}` : 'dev-nickole-workflow';
}
/**
 * Install command for a release, matching how a project runs dnw: a dev dependency for npx, otherwise global.
 * Global installs use the tag's tarball: npm 11 links a global git install to a temp clone it then deletes.
 */
export function installCommand(dnwCommand, version) {
    const source = installSource();
    if (dnwCommand.startsWith('npx'))
        return `npm i -D ${source}#v${version}`;
    const repo = source.replace(/^github:/, '');
    return source.startsWith('github:')
        ? `npm i -g https://github.com/${repo}/archive/refs/tags/v${version}.tar.gz`
        : `npm i -g ${source}@${version}`;
}
