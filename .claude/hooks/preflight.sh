#!/usr/bin/env bash
set -euo pipefail
python scripts/validate_canonical_docs.py
if git diff --name-only | grep -E '(^|/)(requirements|decision-register|data-api-rbac|routes|permissions)' >/dev/null 2>&1; then
  echo "Aviso: cambio canónico detectado; actualice trazabilidad y contratos." >&2
fi
