# Agent instructions

## Product invariant

The product measures English mastery. A click, page visit, audio play, or self-declared completion must never increase mastery. Only scored assessment attempts and scheduled reviews may change mastery state.

## Architecture

- Keep `packages/domain` free of filesystem, network, database, and framework imports.
- Route handlers call deep domain modules; they must not duplicate mastery or review rules.
- Database code stays behind the repository seam in `packages/database`.
- The web app consumes typed DTOs and must not recreate score calculations.

## Public repository restrictions

- Never commit `.env`, credentials, access keys, cookies, session secrets, certificates, server inventories, or SSH details.
- Never commit user databases, profiles, recordings, backups, logs, analytics exports, or screenshots containing private learning data.
- Never commit licensed curriculum PDFs, lesson audio, dictionary databases, extracted dictionary audio, or full private course JSON.
- Use `content-private/` for local curriculum assets; it is intentionally ignored.
- Use synthetic fixtures under `packages/domain/src/fixtures/` for tests.
- Do not weaken `.gitignore` to make a deployment convenient.

These limits exist because the repository is public, the curriculum may be licensed, and learning records plus voice recordings are personal data. Deployment receives private assets through server-side mounts, not Git.

## Delivery

- Run `pnpm check` before publishing.
- Keep production deployment reversible.
- Do not delete legacy learning data until the user explicitly authorizes the cutover action at execution time.
