import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const RECOMMENDATIONS = {
    nextjs: { framework: 'Vitest + Playwright', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' },
    'node-api': { framework: 'Vitest', testCommand: 'npm test', testFileCommand: 'npx vitest run {file}' },
    laravel: { framework: 'PHPUnit', testCommand: 'php artisan test', testFileCommand: 'php artisan test {file}' },
    php: { framework: 'PHPUnit', testCommand: 'php vendor/bin/phpunit', testFileCommand: 'php vendor/bin/phpunit {file}' },
    flutter: { framework: 'flutter_test', testCommand: 'flutter test', testFileCommand: 'flutter test {file}' },
    go: { framework: 'go test', testCommand: 'go test ./...', testFileCommand: 'go test ./{dir}' },
    python: { framework: 'pytest', testCommand: 'pytest', testFileCommand: 'pytest {file}' },
    other: { framework: '', testCommand: '', testFileCommand: '' },
};
/** Recommendation for a project with no test setup yet. */
export function recommend(stack) {
    return { ...RECOMMENDATIONS[stack] };
}
export function readPackageJson(root) {
    const path = join(root, 'package.json');
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        // unreadable package.json still means a Node project
        return {};
    }
}
function readComposerJson(root) {
    const path = join(root, 'composer.json');
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        // unreadable composer.json still means a PHP project
        return {};
    }
}
export function detectStack(root) {
    // these come before package.json: Flutter repos often carry one for tooling such as `npx supabase`,
    // and every Laravel app ships one for Vite (with React or Vue it would read as Next.js)
    if (existsSync(join(root, 'pubspec.yaml')))
        return 'flutter';
    const composer = readComposerJson(root);
    if (existsSync(join(root, 'artisan')) || (composer?.require && 'laravel/framework' in composer.require))
        return 'laravel';
    if (composer)
        return 'php';
    const pkg = readPackageJson(root);
    if (pkg) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return 'next' in deps || 'react' in deps ? 'nextjs' : 'node-api';
    }
    if (existsSync(join(root, 'go.mod')))
        return 'go';
    if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt')))
        return 'python';
    return 'other';
}
function packageManager(root) {
    if (existsSync(join(root, 'pnpm-lock.yaml')))
        return 'pnpm';
    if (existsSync(join(root, 'yarn.lock')))
        return 'yarn';
    if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb')))
        return 'bun';
    return 'npm';
}
const RUNNERS = [
    { match: /\bvitest\b/, framework: 'Vitest', fileCommand: 'npx vitest run {file}' },
    { match: /\bjest\b/, framework: 'Jest', fileCommand: 'npx jest {file}' },
    { match: /\bmocha\b/, framework: 'Mocha', fileCommand: 'npx mocha {file}' },
];
/** Test commands for this project: its existing setup when it has one, otherwise the stack's recommendation. */
export function detectTestSetup(root, stack) {
    if (stack === 'laravel' || stack === 'php')
        return phpTestSetup(root, stack);
    if (stack !== 'nextjs' && stack !== 'node-api')
        return recommend(stack);
    const pm = packageManager(root);
    const script = readPackageJson(root)?.scripts?.test;
    if (script === undefined || /no test specified/.test(script))
        return { ...recommend(stack), testCommand: `${pm} test` };
    const runner = RUNNERS.find((r) => r.match.test(script));
    if (!runner)
        return { framework: 'existing test script', testCommand: `${pm} test`, testFileCommand: `${pm} test -- {file}` };
    return { framework: `${runner.framework} (existing)`, testCommand: `${pm} test`, testFileCommand: runner.fileCommand };
}
/** Laravel runs Pest and PHPUnit alike through `php artisan test`; other PHP projects call the runner directly. */
function phpTestSetup(root, stack) {
    const composer = readComposerJson(root);
    const pest = Boolean(composer && 'pestphp/pest' in { ...composer.require, ...composer['require-dev'] });
    const framework = pest ? 'Pest' : 'PHPUnit';
    if (stack === 'laravel')
        return { ...recommend('laravel'), framework };
    // `php vendor/bin/...` rather than `vendor/bin/...` so it also runs from cmd.exe on Windows
    const bin = pest ? 'php vendor/bin/pest' : 'php vendor/bin/phpunit';
    return { framework, testCommand: bin, testFileCommand: `${bin} {file}` };
}
