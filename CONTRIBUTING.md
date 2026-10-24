# Contributing

Bug reports, documentation improvements, translations, and focused code changes are welcome.

## Report a problem

Include the steps to reproduce, expected and actual behavior, operating system, startup command,
and relevant error messages. For interface problems, include a screenshot with personal data
removed. Do not include passwords, private keys, account files, backups, or your `.env` file.

## Set up locally

1. Fork and clone the repository, then create a branch for your change.
2. Follow [README.md](README.md) or [README-TH.md](README-TH.md) to configure PostgreSQL and `.env`.
   Use a separate development database and test accounts.
3. Install frontend dependencies with `pnpm install --frozen-lockfile`.
4. Start the API with `cargo run --manifest-path backend/Cargo.toml` and the frontend with `pnpm dev`.
   Alternatively, use the Docker launchers documented in the README.

After source changes, rebuild Docker with `./start.ps1 -Build` on Windows or
`bash ./start.sh --build` on Linux/macOS.

## Make a change

- Keep each pull request focused on one problem or feature.
- Follow existing components, styles, API patterns, and validation rules.
- Update both `src/locales/en.json` and `src/locales/th.json` for user-facing text.
- Add a new SQL migration under `backend/migrations/` for schema changes; preserve existing data
  and avoid editing previously applied migrations.
- Preserve password protection, account ownership checks, and encrypted-data compatibility.
- Keep credentials, local data, generated build output, and private recovery tools out of commits.
- Update documentation when commands or behavior change.

## Validate

Run the checks relevant to your changes from the project root:

```sh
pnpm lint
pnpm build
cargo check --manifest-path backend/Cargo.toml
cargo test --manifest-path backend/Cargo.toml
```

For interface changes, check English and Thai, light and dark themes, and desktop and mobile
layouts. For database or encryption changes, verify existing data remains readable using a
development copy. Include a regression test when it demonstrates the behavior being fixed.

## Open a pull request

Describe the problem, the resulting behavior, and how you validated it. Include screenshots for
visible changes and note any migration or compatibility requirements. State which checks could
not be run and why. Keep unrelated formatting and refactoring out of the pull request.
