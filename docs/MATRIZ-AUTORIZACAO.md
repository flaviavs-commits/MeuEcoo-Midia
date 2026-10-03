# Matriz de autorização

Quem pode o quê em cada recurso. Cada linha marcada com ✅ teste tem prova em
`tests/integration-db/isolamento.test.js`, que roda na CI contra um Postgres real, com
autenticação de verdade (token de sessão e `requireAuth` lendo o usuário no banco) e o SQL das
rotas sem mock. A ideia é que uma regressão de isolamento quebre a CI antes de chegar a um cliente.

Papéis:

- **dono:** quem criou o recurso, ou o `owner` do workspace.
- **estranho:** outro usuário qualquer, com plano ativo.
- **admin do sistema:** `users.role = 'admin'`. Ele passa pelas travas de plano, mas **não ganha leitura ampliada** dos dados dos clientes pelas rotas comuns. O painel `/api/admin` é outra superfície, coberta em `tests/integration/adminRoutes.test.js`.
- **admin / editor / revisor:** papéis de membro de workspace.

## Recursos de um usuário

Rotas: `/api/smartlinks`, `/api/content-queues`, `/api/report-schedules`, `/api/media-assets`,
`/api/drafts`, `/api/api-keys`.

| Ação | dono | estranho | admin do sistema |
|---|---|---|---|
| listar | vê os seus ✅ teste | não vê os do dono ✅ teste | não vê os do dono ✅ teste |
| alterar (PATCH) | sim | 404, nada muda ✅ teste | (igual ao estranho) |
| apagar / revogar | sim | sem efeito no do dono ✅ teste | (igual ao estranho) |

O isolamento vem de toda consulta filtrar por `user_id = req.user.id`. O `DELETE` de um id alheio
responde 204 sem apagar nada, o que não vaza se o id existe.

## Workspaces (`/api/workspaces`)

| Ação | owner | admin | editor | revisor | não membro (inclui admin do sistema) |
|---|---|---|---|---|---|
| ver o espaço na lista | sim | sim | sim | sim | não ✅ teste |
| ver membros | sim | sim | sim ✅ teste | sim ✅ teste | 403 ✅ teste |
| editar a marca | sim | sim | 403 ✅ teste | 403 ✅ teste | 403 ✅ teste |
| convidar / mudar papel | sim | sim | 403 ✅ teste | 403 ✅ teste | 403 ✅ teste |
| mudar o papel do **owner** pelo convite | 409 ✅ teste | 409 ✅ teste | — | — | — |
| ver aprovações | sim | sim | sim | sim | 403 ✅ teste |
| pedir aprovação de post | só do próprio post ✅ teste | idem | idem ✅ teste | idem (404 em post alheio ✅ teste) | 400 ✅ teste |
| avaliar aprovação | sim | sim | 403 ✅ teste | sim ✅ teste | 403 ✅ teste |
| aprovar o próprio pedido | 403 ✅ teste | 403 | 403 | 403 | — |

O bloqueio de mudar o papel do owner foi corrigido em 03/10/2026. Antes, o convite com o e-mail do
dono fazia `ON CONFLICT ... DO UPDATE SET role`: um admin do espaço rebaixava o dono, ou o próprio
dono se rebaixava, e o espaço ficava sem dono.

## O que ainda falta cobrir

- Rotas de posts, contas e tokens: cobertas com mock em `tests/integration/`, ainda não no banco real.
- Painel `/api/admin` com papel super admin (o fixture existe em `adminRoutes.test.js`, mas não é usado).
- A camada de banco (papel sem `BYPASSRLS` e RLS por `user_id`), no plano `docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md`.
