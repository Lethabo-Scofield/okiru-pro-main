# okiru-shared (Python template)

> Scaffold for new shared Python packages under the `okiru.*` namespace.
> **Do not consume this from applications.** Copy the folder and rename.

## Create a new shared Python package

```bash
cp -R packages/py-shared packages/py-<your-name>
# then rename the inner module:
git mv packages/py-<your-name>/src/okiru/shared packages/py-<your-name>/src/okiru/<your_name>
# and update pyproject.toml: project.name -> okiru-<your-name>,
# [tool.hatch.build.targets.wheel].packages -> ["src/okiru"]
```

Then:

1. Update `OWNERS.md` with your team and on-call.
2. Update `catalog.json` with `category`, `tier`, and `consumers`.
3. Replace `src/okiru/<your_name>/__init__.py` with your real public API.
4. Bump `version` to `0.1.0` once an `experimental` tier is reached.
5. Consumers add `okiru-<your-name>>=0.1,<0.2` to their `pyproject.toml`.

See `docs/governance/` for the full lifecycle.

## Layout

```
packages/py-<name>/
├── pyproject.toml          # build config, deps, lint
├── src/
│   └── okiru/              # PEP 420 namespace package (no __init__.py needed,
│       │                   # but we ship one for clarity)
│       └── <name>/         # actual module
│           └── __init__.py # public API
├── tests/
│   └── test_*.py
├── OWNERS.md
├── catalog.json
├── CHANGELOG.md
└── README.md
```

## Testing locally

```bash
cd packages/py-<name>
pip install -e '.[dev]'
pytest
```
