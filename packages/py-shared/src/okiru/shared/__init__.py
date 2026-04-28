"""okiru.shared — placeholder module for the shared-Python template package.

When a real shared component is needed:

1. Copy `packages/py-shared/` to `packages/py-<your-name>/`.
2. Rename `src/okiru/shared/` to `src/okiru/<your_name>/`.
3. Update pyproject.toml `[project] name`, `[tool.hatch.build.targets.wheel] packages`.
4. Populate OWNERS.md and catalog.json.
5. Replace this file with the real public API.

See `docs/governance/component-taxonomy.md` for the full lifecycle.
"""

__all__ = ["TEMPLATE_PACKAGE_PLACEHOLDER"]

TEMPLATE_PACKAGE_PLACEHOLDER = True
