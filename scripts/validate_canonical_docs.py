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
version=(root/'VERSION').read_text(encoding='utf-8').strip()
for rel in required:
    p=root/rel
    if p.suffix in {'.md','.json','.yaml'} and p.exists() and rel!='VERSION':
        txt=p.read_text(encoding='utf-8')
        if rel not in {'.mcp.json','.claude/settings.json','contracts/openapi.yaml'} and version not in txt:
            errors.append(f'VERSION_NOT_REFERENCED {rel}')
req=json.loads((root/'contracts/requirements.json').read_text(encoding='utf-8'))
decs=json.loads((root/'contracts/decisions.json').read_text(encoding='utf-8'))
routes=json.loads((root/'contracts/routes.json').read_text(encoding='utf-8'))
perms=json.loads((root/'contracts/permissions.json').read_text(encoding='utf-8'))
states=json.loads((root/'contracts/states.json').read_text(encoding='utf-8'))
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

# --- Reglas contables (DEC-018) --------------------------------------------
#
# Nada comprobaba contracts/accounting-rules.json, y tenia dos defectos que un
# vistazo no encuentra: FINANCIAL_TRANSFER resolvia debito y credito con el
# MISMO resolvedor sobre el mismo campo, de modo que el asiento cuadraba y no
# movia nada; y el signo de la diferencia de conciliacion vivia en una nota en
# prosa en vez de en la regla, asi que un motor que la aplicara tal como estaba
# declarada contabilizaba un faltante sobre una caja que sobraba.
#
# Las cuatro comprobaciones de abajo son las que habrian atrapado ambos.
acc=json.loads((root/'contracts/accounting-rules.json').read_text(encoding='utf-8'))
# `roles` agrupa por naturaleza contable (financial, revenue, liability, asset,
# expense, adjustment); lo que citan las reglas son los roles de dentro.
roles_acc={rol for grupo in acc.get('roles',{}).values() for rol in grupo}
resolvers_acc=set(acc.get('resolvers',{}))

for regla in acc.get('rules',[]):
    code=regla.get('code','<sin code>')
    debits=regla.get('debits',[])
    credits=regla.get('credits',[])

    # 1. Partida doble: ACC-001 exige que todo asiento tenga los dos lados.
    if not debits or not credits:
        errors.append(f'ACCOUNTING_RULE_UNBALANCED {code}')

    # 2. Todo rol y todo resolvedor citados existen.
    #
    # `inverseOf` es la tercera forma valida de nombrar un destino: la reversion
    # (DEC-018 regla 22) no cita cuentas, sino las lineas inversas del original.
    for lado in (*debits, *credits):
        rol=lado.get('role')
        res=lado.get('resolver')
        inv=lado.get('inverseOf')
        if rol is not None and rol not in roles_acc:
            errors.append(f'ACCOUNTING_UNKNOWN_ROLE {rol} en {code}')
        if res is not None and res not in resolvers_acc:
            errors.append(f'ACCOUNTING_UNKNOWN_RESOLVER {res} en {code}')
        if rol is None and res is None and inv is None:
            errors.append(f'ACCOUNTING_LINE_WITHOUT_TARGET en {code}')

    # 3. El asiento que se anula a si mismo: el mismo destino a ambos lados.
    #
    # Se ignoran las lineas por `inverseOf`, cuyo destino depende del asiento
    # original y no puede compararse aqui.
    def destinos(lineas):
        return {(l.get('role'), l.get('resolver'))
                for l in lineas if l.get('inverseOf') is None}
    repetidos=destinos(debits) & destinos(credits)
    if repetidos:
        errors.append(f'ACCOUNTING_RULE_SELF_CANCELLING {code}: {sorted(map(str,repetidos))}')

# 4. Ningun ROL lleva un «o» dentro. DEC-018 retiro
#    `RECONCILIATION_DIFFERENCES_OR_DEFINED_COUNTERPART` por eso mismo: un
#    identificador con un «o» no es resoluble por maquina.
#
#    Los resolvedores quedan fuera a proposito: elegir entre varias cuentas es
#    justamente su trabajo, y `EXPENSE_OR_ASSET_BY_ITEM` declara en `resolvesTo`
#    a cuales puede resolver.
for nombre in roles_acc:
    if '_OR_' in nombre:
        errors.append(f'ACCOUNTING_AMBIGUOUS_ROLE {nombre}')

# --- Trazabilidad de identificadores ---------------------------------------
#
# Anadido tras la renumeracion a la base v2.6. Sin esta comprobacion, una cita
# a un requisito que ya no existe no rompe nada: no falla la compilacion ni
# ninguna prueba. La trazabilidad simplemente empieza a mentir en silencio,
# que es exactamente lo que ocurrio entre v2.6 y v2.7.
CANON=set(ids)

# La lista de familias se enumera a mano, y esa fue la grieta: `PRV-003` y
# `PRV-004` se citaron en tres archivos durante meses sin que nada protestara,
# porque `PRV` no estaba aqui. La comprobacion decia buscar citas inexistentes y
# solo buscaba las de las familias que ya conocia.
#
# Ahora la expresion acepta cualquier prefijo de tres o cuatro mayusculas. Las
# canonicas salen del propio contrato; las demas se enumeran como retiradas o
# inventadas para que citarlas falle en vez de pasar en silencio. `DEC` y `ADR`
# quedan fuera a proposito: no son requisitos y tienen su propio registro.
NO_REQUISITO={'DEC','ADR','TBD','RFC','ISO','UTC','SHA','API','SQL','MFA','SMTP','WCAG','OWASP','ASVS','REF'}
ID_RE=re.compile(r'\b([A-Z]{2,4})-\d{3}\b')

# Rango abreviado: `X-NNN..NNN` o `X-NNN/NNN`. Ver la comprobacion 4.
RANGO_RE=re.compile(r'\b([A-Z]{2,4})-\d{3}\s*(?:\.\.|/)\s*\d{3}\b')

def es_cita_de_requisito(m):
    return m.group(1) not in NO_REQUISITO

# Documentos de migracion: citan a proposito las dos numeraciones.
EXENTOS={
 'docs/04-delivery/requirement-migration-v2.6-to-current.md',
 'docs/04-delivery/requirement-renumbering-table.md',
 'docs/04-delivery/READINESS_REPORT-correccion-contable.md',
 'docs/01-product/requirements-candidates-v26.md',
 'docs/04-delivery/source-migration-matrix.md',
 # Retrospectiva de la sesion: explica la colision de identificadores y por
 # tanto necesita nombrar los retirados. Misma razon que los anteriores.
 'handoff.md',
 # Informe de revision de la rama, fechado. No es fuente de verdad: es la foto
 # de un dia. Nombra identificadores retirados porque el defecto que reporta es
 # justamente que siguen citados en rangos abreviados del codigo y de los
 # documentos. Cuando esos rangos se corrijan, este informe pasara a historico
 # y su exencion debera retirarse con el.
 'docs/04-delivery/revision-rama-v2.6.md',
}
EXENTOS_PREFIJO=('archive/','prototypes/','generated-docx/','node_modules/','dist/','.git/')

# 1. requirements.md y requirements.json declaran el mismo conjunto.
en_md={m.group(0) for m in ID_RE.finditer(text) if es_cita_de_requisito(m)}
for i in sorted(en_md-CANON): errors.append(f'REQUIREMENT_IN_MD_NOT_IN_CONTRACT {i}')
for i in sorted(CANON-en_md): errors.append(f'REQUIREMENT_IN_CONTRACT_NOT_IN_MD {i}')

# 2. Todo requisito vigente tiene fase y prompt asignados.
#
# Lo exige el paquete de correccion documental: un requisito sin fase ni prompt
# no lo implementa nadie y no lo reclama ningun gate. Se activa aqui porque los
# 198 ya estan clasificados; antes habria fallado por diseno.
fases=json.loads((root/'contracts/phase-requirement-map.json').read_text(encoding='utf-8'))
prompts=json.loads((root/'contracts/prompt-requirement-map.json').read_text(encoding='utf-8'))
con_fase={i for v in fases['phases'].values() for i in v}
con_prompt={i for v in prompts['prompts'].values() for i in v}
for i in sorted(CANON-con_fase): errors.append(f'REQUIREMENT_WITHOUT_PHASE {i}')
for i in sorted(CANON-con_prompt): errors.append(f'REQUIREMENT_WITHOUT_PROMPT {i}')
for i in sorted((con_fase|con_prompt)-CANON): errors.append(f'ORPHAN_IN_TRACEABILITY_MAP {i}')

# 3. Ninguna cita del repositorio apunta a un requisito inexistente.
for p in root.rglob('*'):
    if not p.is_file() or p.suffix not in {'.ts','.tsx','.md','.json','.prisma','.sql','.mts'}: continue
    rel=p.relative_to(root).as_posix()
    if rel in EXENTOS or any(rel.startswith(x) or f'/{x}' in f'/{rel}' for x in EXENTOS_PREFIJO): continue
    try: t=p.read_text(encoding='utf-8')
    except (UnicodeDecodeError, OSError): continue
    citados={m.group(0) for m in ID_RE.finditer(t) if es_cita_de_requisito(m)}
    for i in sorted(citados-CANON):
        errors.append(f'UNKNOWN_REQUIREMENT_ID {i} en {rel}')

    # 4. Nadie escribe rangos abreviados de requisitos.
    #
    # La renumeracion los partio por la mitad: sustituia identificadores
    # completos, y el numero de la derecha no lleva prefijo. `FOOD-001..004`
    # quedo como `FOD-001..004`, que hoy incluye un FOD-004 inexistente; y
    # `HOS-001..008` quedo como `HOS-011..008`, un rango descendente. Veinte
    # sitios asi, y la comprobacion 3 no los veia porque el numero huerfano no
    # es una cita.
    #
    # Ademas la renumeracion rompio la contiguidad, de modo que ya no existe
    # ningun rango de requisitos valido: `REG-001..005` es hoy REG-019, PAY-001,
    # REG-020, REG-021 y REG-022. Se exigen identificadores explicitos.
    #
    # `DEC-001..017` y demas quedan fuera: no son requisitos y su numeracion si
    # es contigua.
    for m in RANGO_RE.finditer(t):
        if m.group(1) in NO_REQUISITO: continue
        errors.append(f'REQUIREMENT_RANGE_NOT_ALLOWED {m.group(0)} en {rel}')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK ENCUENTRO docs v{version}: {len(ids)} requirement IDs, {len(routes["routes"])} routes, {len(perms["permissions"])} permissions')
