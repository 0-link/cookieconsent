import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix, resolve } from 'node:path';

const packageName = '@0-link/cookieconsent';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const lifecycleScripts = [
    'preinstall', 'install', 'postinstall', 'prepare', 'preprepare', 'postprepare',
    'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'postpublish'
];
const requiredFiles = [
    'package.json', 'LICENSE', 'Readme.md', 'types/index.d.ts',
    'dist/cookieconsent.umd.js', 'dist/cookieconsent.esm.js', 'dist/cookieconsent.css',
    'dist/core/cookieconsent-core.umd.js', 'dist/core/cookieconsent-core.esm.js',
    'dist/css-components/base.css', 'dist/css-components/consent-modal.css',
    'dist/css-components/preferences-modal.css', 'dist/css-components/dark-scheme.css',
    'dist/css-components/light-scheme.css'
];

function check(condition, message) {
    if (!condition) throw new Error(message);
}

function validateManifest(pkg, expectedVersion) {
    check(pkg.name === packageName, `Package name must be ${packageName}`);
    check(stableVersion.test(expectedVersion), 'Expected version must be an exact stable semver, without v');
    check(pkg.version === expectedVersion, 'Package version does not match expected version');
    check(pkg.private !== true, 'private:true prevents the intended private-registry publication');
    check(pkg.repository?.type === 'git' &&
        /^(git\+)?https:\/\/github\.com\/0-link\/cookieconsent(?:\.git)?$/.test(pkg.repository.url),
    'Repository must be 0-link/cookieconsent');
    check(/^https:\/\/npm\.pkg\.github\.com\/?$/.test(pkg.publishConfig?.registry),
        'publishConfig.registry must be https://npm.pkg.github.com');
    check(Object.keys(pkg.publishConfig).every(key => ['registry', 'access'].includes(key)) &&
        (!pkg.publishConfig.access || pkg.publishConfig.access === 'restricted'),
    'publishConfig must not override publication settings or request public access');
    check(pkg.packageManager === 'pnpm@11.17.0', 'packageManager must be pnpm@11.17.0');
    check(Array.isArray(pkg.files) && pkg.files.length === 2 &&
        new Set(pkg.files).size === 2 && ['dist', 'types'].every(path => pkg.files.includes(path)),
    'Package files must allow only dist and types (npm also includes README, LICENSE and package.json)');
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
        check(!pkg[field] || Object.keys(pkg[field]).length === 0,
            `${field} must remain empty, matching the upstream runtime dependency baseline`);
    }
    for (const script of lifecycleScripts) {
        check(!Object.hasOwn(pkg.scripts ?? {}, script), `Forbidden publication/install lifecycle script: ${script}`);
    }
    check(pkg.main === 'dist/cookieconsent.umd.js' && pkg.module === 'dist/cookieconsent.esm.js' &&
        pkg.types === 'types/index.d.ts', 'Package entry points must retain the upstream dist/types paths');
}

function validateFiles(files) {
    const paths = new Set();
    for (const file of files) {
        const path = file.path;
        check(typeof path === 'string' && posix.normalize(path) === path &&
            !path.split('/').some(part => part.startsWith('.')) && !paths.has(path),
        `Unsafe or duplicate package path: ${path}`);
        check(requiredFiles.includes(path), `Unexpected packaged file: ${path}`);
        check(Number.isSafeInteger(file.size) && file.size > 0, `Empty or invalid packaged file: ${path}`);
        paths.add(path);
    }
    for (const path of requiredFiles) check(paths.has(path), `Missing required packaged file: ${path}`);
}

function command(binary, args) {
    const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    check(!result.error && !result.signal && result.status === 0,
        `${binary} failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
    return result.stdout;
}

function selfTest() {
    const fixture = {
        name: packageName, version: '3.2.1', packageManager: 'pnpm@11.17.0',
        repository: { type: 'git', url: 'https://github.com/0-link/cookieconsent' },
        publishConfig: { registry: 'https://npm.pkg.github.com/' }, files: ['dist', 'types'],
        main: 'dist/cookieconsent.umd.js', module: 'dist/cookieconsent.esm.js', types: 'types/index.d.ts'
    };
    const files = requiredFiles.map(path => ({ path, size: 1 }));
    validateManifest(fixture, '3.2.1');
    validateFiles(files);
    for (const mutation of [
        pkg => { pkg.name = 'vanilla-cookieconsent'; },
        pkg => { pkg.version = '3.2.0'; },
        pkg => { pkg.repository.url = 'https://github.com/orestbida/cookieconsent'; },
        pkg => { pkg.publishConfig.registry = 'https://registry.npmjs.org'; },
        pkg => { pkg.publishConfig.access = 'public'; },
        pkg => { pkg.dependencies = { unexpected: '1.0.0' }; },
        pkg => { pkg.scripts = { install: 'echo unexpected' }; },
        pkg => { pkg.files.push('src'); }
    ]) {
        const bad = structuredClone(fixture);
        mutation(bad);
        assert.throws(() => validateManifest(bad, '3.2.1'));
    }
    assert.throws(() => validateManifest(fixture, '3.2.1; echo unsafe'));
    for (const path of ['.npmrc', 'src/index.js', 'dist/.env', 'types/token.pem',
        'dist/../package.json', 'dist/unexpected.js', 'types/unexpected.d.ts']) {
        assert.throws(() => validateFiles([...files, { path, size: 1 }]));
    }
    assert.throws(() => validateFiles(files.slice(1)));
    assert.throws(() => validateFiles([...files, files[0]]));
    console.log('Package preflight self-test passed (identity, version, registry, lifecycle, dependencies, allowlist).');
}

function pack() {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const expectedVersion = process.env.EXPECTED_VERSION ?? pkg.version;
    validateManifest(pkg, expectedVersion);
    if (process.argv.includes('--manifest-only')) {
        console.log(`Validated release manifest: ${pkg.name}@${pkg.version}`);
        return;
    }
    const directory = process.env.PACK_DIR
        ? resolve(process.env.PACK_DIR)
        : mkdtempSync(join(tmpdir(), 'cookieconsent-pack-'));
    check(!/[\r\n]/.test(directory), 'Pack directory must not contain newlines');
    mkdirSync(directory, { recursive: true });
    const reports = JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory]));
    check(reports.length === 1, 'Expected exactly one packed package');
    const report = reports[0];
    check(report.name === packageName && report.version === expectedVersion, 'Packed identity differs from manifest');
    check(typeof report.filename === 'string' && basename(report.filename) === report.filename,
        'Invalid packed tarball filename');
    validateFiles(report.files);
    const tarball = join(directory, report.filename);
    const entries = command('tar', ['-tzf', tarball]).trim().split('\n');
    const expectedEntries = report.files.map(file => `package/${file.path}`).sort();
    check(JSON.stringify(entries.sort()) === JSON.stringify(expectedEntries), 'Tarball paths differ from npm pack report');
    const listing = command('tar', ['-tvzf', tarball]).trim().split('\n');
    check(listing.every(line => line.startsWith('-')), 'Tarball must contain regular files only, not links');
    const packedManifest = JSON.parse(command('tar', ['-xOf', tarball, 'package/package.json']));
    validateManifest(packedManifest, expectedVersion);
    for (const path of expectedEntries) {
        const content = command('tar', ['-xOf', tarball, path]);
        check(!/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|npm_[A-Za-z0-9]{30,})\b|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content),
            `Potential credential material in ${path}`);
    }
    const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${tarball}\nsha256=${sha256}\n`);
    }
    console.log(`Validated ${pkg.name}@${pkg.version}: ${report.files.length} files\nTarball: ${tarball}\nSHA256: ${sha256}`);
}

try {
    const args = process.argv.slice(2);
    check(args.length <= 1 && args.every(arg => ['--self-test', '--manifest-only'].includes(arg)),
        'Usage: node scripts/package-preflight.mjs [--self-test|--manifest-only]');
    if (args.includes('--self-test')) selfTest();
    else pack();
} catch (error) {
    console.error(`Package preflight failed: ${error.message}`);
    process.exitCode = 1;
}
