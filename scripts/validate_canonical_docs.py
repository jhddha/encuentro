#!/usr/bin/env python3
from pathlib import Path
import json, sys, re
root = Path(__file__).resolve().parents[1]
errors=[]
required=[
 'VERSION','README.md','CLAUDE.md','.mcp.json','.claude/settings.json',
 'docs/01-product/requirements.md','docs/02-architecture/system-architecture.md',
 'docs/02-architecture/data-api-rbac.md','docs/03-design/design-system.md',
 'docs/04-delivery/execution-plan.md','docs/04-delivery/decision-register.md',
 'contracts/requirements.json','contracts/decisions.json','contracts/routes.json',
 'contracts/permissions.json','contracts/states.json','contracts/openapi.yaml'
]
for rel in required:
    if not (root/rel).exists(): errors.append(f'MISSING {rel}')
version=(root/'VERSION').read_text().strip()
for rel in required:
    p=root/rel
    if p.suffix in {'.md','.json','.yaml'} and p.exists() and rel!='VERSION':
        txt=p.read_text(encoding='utf-8')
        if rel not in {'.mcp.json','.claude/settings.json','contracts/openapi.yaml'} and version not in txt:
            errors.append(f'VERSION_NOT_REFERENCED {rel}')
req=json.loads((root/'contracts/requirements.json').read_text())
decs=json.loads((root/'contracts/decisions.json').read_text())
routes=json.loads((root/'contracts/routes.json').read_text())
perms=json.loads((root/'contracts/permissions.json').read_text())
states=json.loads((root/'contracts/states.json').read_text())
ids=[x['id'] for x in req['requirements']]
if len(ids)!=len(set(ids)): errors.append('DUPLICATE_REQUIREMENT_ID')
for d in ['DEC-001','DEC-002','DEC-003','DEC-004']:
    found=[x for x in decs['decisions'] if x['id']==d and x.get('status')=='APPROVED']
    if not found: errors.append(f'DEC_NOT_APPROVED {d}')
    if not (root/f'docs/04-delivery/decisions/{d}.md').exists(): errors.append(f'DEC_FILE_MISSING {d}')
if '/verificar/comprobante/[token]' not in routes['routes']: errors.append('RECEIPT_PUBLIC_ROUTE_MISSING')
for p in ['catalog.private.assign','payment.proof.review','receipt.read_sensitive','receipt.void']:
    if p not in perms['permissions']: errors.append(f'PERMISSION_MISSING {p}')
if 'IN_PROGRESS' not in states['event']: errors.append('STATE_MISSING IN_PROGRESS')
text=(root/'docs/01-product/requirements.md').read_text(encoding='utf-8')
for phrase in ['no se prorratea','50%','Documento de control interno','7 noches','8 días','Paquetes privados']:
    if phrase.lower() not in text.lower(): errors.append(f'REQUIREMENT_PHRASE_MISSING {phrase}')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK ENCUENTRO docs v{version}: {len(ids)} requirement IDs, {len(routes["routes"])} routes, {len(perms["permissions"])} permissions')
