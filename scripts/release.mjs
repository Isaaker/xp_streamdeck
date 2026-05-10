#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(repoRoot, 'package.json');
const manifestPath = resolve(repoRoot, 'com.robertw.xplane.sdPlugin/manifest.json');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Usage: node scripts/release.mjs X.Y.Z\n  got: ${version ?? '(none)'}`);
    process.exit(1);
}
const tag = `v${version}`;

function git(args, opts = {}) {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', ...opts }).trim();
}

const status = git('status --porcelain');
if (status) {
    console.error('Working tree is not clean. Commit or stash first:\n' + status);
    process.exit(1);
}

const branch = git('rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
    console.error(`Releases must be cut from main, currently on '${branch}'.`);
    process.exit(1);
}

const existingTag = execSync(`git tag --list ${tag}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
if (existingTag) {
    console.error(`Tag ${tag} already exists.`);
    process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.Version = `${version}.0`;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);

console.log(`Bumped package.json -> ${version}`);
console.log(`Bumped manifest.json -> ${version}.0`);

git(`add ${pkgPath} ${manifestPath}`, { stdio: 'inherit' });
git(`commit -m "release: ${tag}"`, { stdio: 'inherit' });
git(`tag ${tag}`, { stdio: 'inherit' });
git('push', { stdio: 'inherit' });
git(`push origin ${tag}`, { stdio: 'inherit' });

console.log(`\n${tag} pushed. CI will build and publish the release.`);
