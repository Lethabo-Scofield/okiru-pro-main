# @okiru/_template

> Scaffold for new shared TypeScript packages. **Do not consume this from
> applications.** Copy the folder and rename.

## Create a new shared package

```bash
cp -R packages/_template packages/<your-name>
sed -i 's|@okiru/_template|@okiru/<your-name>|g' packages/<your-name>/package.json
```

Then:

1. Update `OWNERS.md` with your team and on-call.
2. Update `catalog.json` with `category`, `tier`, and `consumers`.
3. Replace `src/index.ts` with your real public API.
4. Bump `version` to `0.1.0` once an `experimental` tier is reached.
5. Add the package as a dependency in any consuming app's `package.json`
   using `"@okiru/<your-name>": "workspace:*"`, then `pnpm install`.

See `docs/governance/` for the full lifecycle.

## Public API conventions

* Everything intended for consumers is re-exported from `src/index.ts`.
* Anything else lives under `src/_internal/` and is **not** covered by SemVer.
* Each public symbol has a TSDoc comment.

## Build & test

| Command           | Purpose                            |
| ----------------- | ---------------------------------- |
| `pnpm typecheck`  | Type-only check, no emit.          |
| `pnpm build`      | Emit declarations + JS to `dist/`. |
| `pnpm test`       | Run the package's test suite.      |
| `pnpm clean`      | Remove `dist/`.                    |
