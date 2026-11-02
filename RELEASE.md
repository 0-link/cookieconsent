# PRIVATE @0-link/cookieconsent release

This fork publishes **only** `@0-link/cookieconsent` to `https://npm.pkg.github.com`, never to public npm. The release prepared here is **3.2.1**, based on upstream `v3.2.1` at `8877939f158cd6689f4bebd55f2e3f9e60bd7754`.

## Local release gate

Use Node 24 (or a compatible supported Node 22 patch) and the exact `packageManager`, **pnpm 11.17.0**, through Corepack. From the repository root, without registry credentials:

```sh
corepack enable
corepack prepare pnpm@11.17.0 --activate
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm lint
corepack pnpm test
corepack pnpm build
node scripts/package-preflight.mjs --self-test
EXPECTED_VERSION=3.2.1 node scripts/package-preflight.mjs
```

The preflight packs with `npm pack --ignore-scripts` into a temporary directory, then validates the **actual tarball**, including its packed manifest. It prints the tarball path and SHA256. Exactly **14 upstream package files** may ship: `package.json`, `LICENSE`, `Readme.md`, `types/index.d.ts`, the three full bundle files, two core bundles, and five CSS components (`base.css`, `consent-modal.css`, `preferences-modal.css`, `dark-scheme.css`, `light-scheme.css`). Every file must be present and nonempty; unknown JS/CSS/declarations are rejected too. No runtime dependencies, install/publication lifecycle hooks, auth files, hidden files, or recognizable GitHub/npm tokens/private keys are allowed. Pattern checks are not a general-purpose secret scanner; maintainers must still review the files being released. `package.json` must keep the fork identity, repository, version, and GitHub `publishConfig`. Do **not** add `private: true`: that disables publication entirely; GitHub package visibility is a separate setting.

Runnable negative smoke checks (no repository edits, no registry access):

```sh
# Expected exit 1: mismatch must fail before packing.
EXPECTED_VERSION=0.0.0 node scripts/package-preflight.mjs --manifest-only
# Expected exit 1: arbitrary input must not become a command or version.
EXPECTED_VERSION='3.2.1; echo unsafe' node scripts/package-preflight.mjs --manifest-only
# Expected exit 0: built-in fixtures reject wrong identity/repository/registry,
# public access, lifecycle hooks, runtime dependencies, extra/missing/unsafe files.
node scripts/package-preflight.mjs --self-test
```

`PACK_DIR=/absolute/scratch/path` optionally selects the tarball directory; do not put tarballs in the repository. These commands do not publish. CI (`.github/workflows/test.yml`) runs frozen install, lint, tests, build, validator self-tests, and tarball validation on pushes and PRs with `contents: read` and **no registry credentials**.

## Hermes approval and publication

1. Under the **Hermes release process**, review and approve the integrated `main` commit, dependency/audit results, rebuilt artifacts, package manifest, and local release gate results. Preparation alone authorizes **no commits, pushes, tags, releases, PRs, or publication**.
2. Confirm GitHub Packages access before authorizing publication. The **existing** `@0-link/cookieconsent` package must remain **PRIVATE**, linked to `0-link/cookieconsent`, and retain its existing consumer/repository access grants and inheritance settings. Ensure this repository's Actions has package access. A missing or inaccessible package blocks publication: this workflow must not create a new package. Do not make the package public, change visibility/access, or use a broad personal token to bypass a failed permission check. See [GitHub's npm registry guidance](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).
3. Only after explicit Hermes authorization, create the fork-specific annotated tag **`0-link-v3.2.1`** at the approved integrated release commit. Any tag push is a separate authorized Hermes action. The upstream **`v3.2.1` tag must not move, be recreated, or be overwritten**. Neither release tags nor GitHub release events trigger publication.
4. An authorized maintainer manually dispatches **Publish PRIVATE GitHub Package** (`.github/workflows/publish.yml`) on **main** with `expected_version` set to **`3.2.1`**. There is no user-supplied checkout ref: the job checks out the dispatch's exact `github.sha`. The fork-only/main-only guard and non-cancelling concurrency group serialize publication.
5. The job repeats the frozen install, lint, tests, build, and preflight **before** exposing a registry credential. Only the final trusted publication step receives `GITHUB_TOKEN` (`packages: write`, `contents: read`). It creates a temporary npm userconfig, works outside the checkout, verifies the exact package name, PRIVATE visibility and repository linkage using [Get a package for an organization](https://docs.github.com/en/rest/packages/packages#get-a-package-for-an-organization) at `GET /orgs/0-link/packages/npm/cookieconsent` (not an organization-wide listing), verifies the validated tarball's SHA256, and checks the exact version on GitHub Packages. An existing version fails clearly. Only an explicit **registry** `E404` permits publication; package metadata lookup errors (including HTTP 404), malformed/mismatched metadata, auth/network/other registry errors abort. The exact validated tarball is published with `--ignore-scripts` to the explicit GitHub registry, with no public-access override. Credentials are not persisted.
6. After an authorized publication, confirm version, repository linkage, **PRIVATE** visibility, unchanged access grants, and the installed package contents using an authorized consumer. Versions are immutable: never retry an existing version with an overwrite or delete-and-republish workaround.

Consumer dependency upgrades are **separate changes** in their respective projects and require their own authorization and validation. Do not modify consumer repositories as part of preparing this package release.

## Action pins

Both workflows use verified full commit pins, not mutable version refs:

- `actions/checkout` **v7.0.1**: `3d3c42e5aac5ba805825da76410c181273ba90b1` ([public tag metadata](https://api.github.com/repos/actions/checkout/git/ref/tags/v7.0.1)).
- `actions/setup-node` **v7.1.0**: `949feb2413d6458794dcd2491c4babbbce0c15c1` ([public tag metadata](https://api.github.com/repos/actions/setup-node/git/ref/tags/v7.1.0)).

Each tag's public GitHub metadata resolved directly to an object of type `commit`. Version comments accompany the pins. Reverify public metadata when updating them; do not copy an unverified SHA from an example. The release-preparation pin evidence is kept in the external Hermes scratch directory, not in the package.
