# Agendador externo para a API dormir — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o agendador do processo web da API para o modo Sleep do Railway funcionar, sem perder publicações nem manutenção.

**Architecture:** A API ganha `SCHEDULER_MODE` (`internal` | `external`). Em `external` ela não roda `node-cron`. Um serviço de cron do Railway (`scripts/agendador-tick.js`, a cada 5 min) consulta o banco com `SELECT EXISTS` e só chama `/api/cron/*` pela rede privada quando há trabalho. O health-check das redes passa a rodar sob demanda dentro da API, e o front repete GETs que recebem 502/503 enquanto a API acorda.

**Tech Stack:** Node.js (CommonJS), Express, `pg`, Jest (backend), Vitest + Testing Library (frontend), Railway config-as-code.

**Spec:** `docs/superpowers/specs/2026-10-02-agendador-externo-sleep-design.md`

## Global Constraints

- `SCHEDULER_MODE` aceita só `internal` (padrão quando ausente ou vazio) e `external`; qualquer outro valor falha o startup.
- Tick: cron `*/5 * * * *`; espera entre tentativas `[1, 2, 4, 8, 16, 30]` s; cada requisição com timeout de 10 s; repete só em 502, 503, erro de rede ou timeout; 4xx não repete.
- Destino do tick: `AGENDADOR_API_URL` (produção `http://social-api-manager.railway.internal:3000`), header `Authorization: Bearer ${CRON_SECRET}`.
- Endpoints: posts → `/api/cron/process-posts`; mídia → `/api/cron/media-cleanup`; tokens → `/api/cron/renew-tokens`.
- Mídia e tokens só são avaliados no primeiro tick de cada janela de 6 h (hora UTC múltipla de 6 e minuto < 5), espelhando o `0 */6 * * *` atual dos tokens e limitando quantas vezes a API acorda por causa deles.
- Health-check sob demanda: idade máxima 15 min.
- Frontend: só `GET` é repetido, até 2 vezes, com espera de 1 s e 3 s.
- O serviço agendador recebe só `DATABASE_URL`, `CRON_SECRET`, `PGSSL_CA_B64`, `PGSSL_SERVER_FINGERPRINT` (por referência à API), `NODE_ENV=production` e `AGENDADOR_API_URL`.
- Código, comentários, mensagens e commits em português, no padrão do repositório; commits direto no `main`, Conventional Commits.

## Review Focus

1. Post vencido segurado por um status `down` antigo em `platform_health`: o detector deve contar o post como trabalho mesmo assim (senão a API nunca acorda para rechecar a saúde e o post fica preso). Teste na Task 3.
2. Pendência da Zernio que nunca se resolve (webhook perdido): não pode manter a API acordada para sempre. O detector ignora pendências Zernio agendadas cujo `scheduledFor` (ou `criadoEm`) passou há mais de 48 h. Teste na Task 3.
3. `CRON_SECRET` ausente ou errado no agendador: 401 não pode virar loop de tentativas; o tick sai com código ≠ 0 em uma tentativa só. Teste na Task 4.
4. Mutação (`POST`) recebendo 502 enquanto a API acorda: não pode ser repetida pelo front (duplicaria post). Teste na Task 5.
5. Tick fora da janela de 6 h com mídia vencida: não chama `media-cleanup` (senão a API acordaria a cada 5 min por causa de mídia que não pode ser apagada). Teste na Task 3.

---

### Task 1: `SCHEDULER_MODE` na API

**Files:**
- Create: `src/config/schedulerMode.js`
- Modify: `src/server.js:470-480` (bloco `require.main === module`, onde hoje chama `scheduler.start()`)
- Test: `tests/unit/schedulerMode.test.js`

**Interfaces:**
- Produces: `resolverModoAgendador(env = process.env) -> 'internal' | 'external'` (lança `Error` com mensagem contendo `SCHEDULER_MODE` para valor inválido); `iniciarTarefasDeFundo({ modo, scheduler }) -> boolean` (chama `scheduler.start()` e devolve `true` só em `internal`).

- [ ] **Step 1: Write the failing tests** em `tests/unit/schedulerMode.test.js`:
  - `resolverModoAgendador({})` → `'internal'`; `({ SCHEDULER_MODE: ' External ' })` → `'external'` (trim + minúsculas); `({ SCHEDULER_MODE: 'cron' })` lança `/SCHEDULER_MODE/`.
  - `iniciarTarefasDeFundo({ modo: 'external', scheduler: { start: jest.fn() } })` → `false` e `start` não chamado; com `'internal'` → `true` e `start` chamado 1 vez.
- [ ] **Step 2: Run** `npx jest tests/unit/schedulerMode.test.js` — Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** as duas funções em `src/config/schedulerMode.js`. Em `src/server.js`, resolver o modo **antes** de `runMigrations()` (valor inválido impede o servidor de subir, mesmo padrão do erro de migration) e trocar `scheduler.start()` por `iniciarTarefasDeFundo({ modo, scheduler })`, logando `Agendador interno desligado (SCHEDULER_MODE=external)` quando devolver `false`.
- [ ] **Step 4: Run** `npx jest tests/unit/schedulerMode.test.js` e `npm test` — Expected: PASS, suíte inteira verde.
- [ ] **Step 5: Commit** `feat(agendador): permite desligar o node-cron da API com SCHEDULER_MODE`

### Task 2: Health-check das redes sob demanda

**Files:**
- Modify: `src/services/platformHealth.js` (nova função, export)
- Modify: `src/services/scheduler.js` (`processarPendentes`, primeira linha)
- Modify: `src/server.js:438-441` (`GET /api/platform-health`)
- Test: `tests/unit/platformHealth.test.js`

**Interfaces:**
- Produces: `garantirSaudeRecente({ maxIdadeMin = 15 } = {}) -> Promise<boolean>` (resolve `true` se rodou `verificarSaudePlataformas`, `false` se a checagem era recente ou já havia outra em andamento). Idade lida com `SELECT MAX(checked_at) FROM platform_health`; tabela vazia conta como velha.

- [ ] **Step 1: Write the failing tests** (mesmo arquivo, mesmos mocks de `pool` e `zernioClient` já usados nele):
  - `MAX(checked_at)` há 5 min → resolve `false` e não consulta tokens nem pinga.
  - `MAX(checked_at)` há 20 min → resolve `true` e chama a verificação (espiar `pingPlatform` pelo mock do client ou por `jest.spyOn` no módulo exportado).
  - Duas chamadas simultâneas com checagem velha → só uma verificação; a segunda resolve `false`.
- [ ] **Step 2: Run** `npx jest tests/unit/platformHealth.test.js` — Expected: FAIL (`garantirSaudeRecente` não existe).
- [ ] **Step 3: Implement** `garantirSaudeRecente` com uma promessa em andamento guardada no módulo (trava em memória). Em `processarPendentes`, `await garantirSaudeRecente()` dentro de `try/catch` que só loga, antes de reservar posts. Em `/api/platform-health`, disparar `garantirSaudeRecente().catch(...)` sem `await` e responder com `getStatusMap` como hoje.
- [ ] **Step 4: Run** `npx jest tests/unit/platformHealth.test.js` e `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(saude-redes): verifica a saúde das redes sob demanda em vez de a cada minuto`

### Task 3: Detector de trabalho

**Files:**
- Modify: `src/infra/db/postsRepository.js` — extrair os critérios de `reservarPostsPendentes` (linhas 207-232) e `recuperarPostsProcessingStale` (275-290) para funções de fragmento SQL exportadas, usadas pelas consultas originais sem mudar o resultado.
- Modify: `src/services/mediaCleanupService.js` — exportar `eligiblePostPredicate` (já existe, linha 12) e garantir que o predicado também exige mídia (`media_path`, `media_items` ou `cover_path` não nulos), como `CANDIDATE_POSTS_QUERY` já pressupõe.
- Modify: `src/repositories/tokensRepository.js` — exportar o fragmento `t.status IN ('expired', 'expiring')` usado por `renovarTodos` (linha ~366).
- Create: `src/services/agendadorTrabalho.js`
- Test: `tests/unit/agendadorTrabalho.test.js`; os testes existentes de `postsRepository`, `mediaCleanupService` e tokens continuam verdes.

**Interfaces:**
- Produces (postsRepository): `predicadoPostAgendadoVencido(alias = 'p') -> string` (status `scheduled`, `scheduled_at` ou `next_retry_at` vencido, fora da fila externa da Zernio, **sem** a exclusão por `platform_health`, que continua só em `reservarPostsPendentes`); `predicadoProcessingParado(alias = 'p') -> string`.
- Produces (agendadorTrabalho): `haPostsParaProcessar() -> Promise<boolean>`, `haMidiaParaLimpar() -> Promise<boolean>`, `haTokensParaRenovar() -> Promise<boolean>`, `detectarTrabalho({ agora = new Date() } = {}) -> Promise<{ posts: boolean, midia: boolean, tokens: boolean }>`. `haPostsParaProcessar` é um único `SELECT EXISTS(...) OR EXISTS(...)` cobrindo: post agendado vencido; `processing` parado; `post_first_comments.status = 'pending'`; `post_accounts.instagram_pending` não Zernio; `instagram_pending` Zernio com `scheduled` diferente de `true` ou com `scheduledFor <= NOW()`, e em ambos os casos `COALESCE(scheduledFor, criadoEm) > NOW() - INTERVAL '48 hours'`. `detectarTrabalho` só consulta mídia e tokens quando `agora.getUTCHours() % 6 === 0 && agora.getUTCMinutes() < 5`; fora disso devolve `false` sem consultar.

- [ ] **Step 1: Write the failing tests** em `tests/unit/agendadorTrabalho.test.js` (pool mockado; os casos verificam o SQL enviado e a resposta):
  - `haPostsParaProcessar` devolve o booleano de `rows[0].existe` e o SQL contém `status = 'scheduled'`, `post_first_comments`, `instagram_pending` e `INTERVAL '48 hours'`.
  - O SQL de `haPostsParaProcessar` **não** contém `platform_health` (Review Focus 1).
  - `predicadoPostAgendadoVencido()` não contém `platform_health`; `reservarPostsPendentes` continua contendo `platform_health` e o fragmento (teste em `tests/unit/repositories`, no arquivo existente de posts ou num novo `postsRepositoryPredicados.test.js`).
  - `detectarTrabalho({ agora: new Date('2026-10-02T12:03:00Z') })` com tudo `true` → `{ posts: true, midia: true, tokens: true }`.
  - `detectarTrabalho({ agora: new Date('2026-10-02T13:03:00Z') })` → `midia` e `tokens` `false`, e o pool recebe só a consulta de posts (Review Focus 5).
  - `detectarTrabalho({ agora: new Date('2026-10-02T12:07:00Z') })` → `midia` e `tokens` `false`.
- [ ] **Step 2: Run** `npx jest tests/unit/agendadorTrabalho.test.js` — Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** os fragmentos nos repositórios, reescrevendo `reservarPostsPendentes` e `recuperarPostsProcessingStale` para usá-los (o resultado das consultas não muda), e `src/services/agendadorTrabalho.js` com as quatro funções.
- [ ] **Step 4: Run** `npx jest tests/unit/agendadorTrabalho.test.js` e `npm test` — Expected: PASS, incluindo os testes antigos de reserva, recuperação, limpeza de mídia e tokens.
- [ ] **Step 5: Commit** `feat(agendador): detecta trabalho pendente com consultas baratas no banco`

### Task 4: Tick do agendador e serviço de cron

**Files:**
- Create: `scripts/agendador-tick.js`
- Create: `railway.agendador.toml`
- Modify: `package.json` (script `"agendador:tick": "node scripts/agendador-tick.js"`)
- Test: `tests/unit/agendadorTick.test.js`

**Interfaces:**
- Consumes: `detectarTrabalho` (Task 3); `src/db/pool` (`end()` ao terminar).
- Produces: `chamarEndpoint(caminho, { baseUrl, segredo, fetchImpl = fetch, esperar = ms => new Promise(r => setTimeout(r, ms)), esperasSeg = [1, 2, 4, 8, 16, 30], timeoutMs = 10000 }) -> Promise<{ ok: boolean, status: number | null, tentativas: number }>` e `executarTick({ detectar, chamar, log = console }) -> Promise<number>` (código de saída: `0` se não havia trabalho ou todas as chamadas deram 2xx; `1` caso contrário). O arquivo só executa (`detectar` real + `chamarEndpoint` + `pool.end()` + `process.exitCode`) quando `require.main === module`. Sem `AGENDADOR_API_URL` ou `CRON_SECRET` → loga e sai com `1` antes de consultar o banco.

- [ ] **Step 1: Write the failing tests** em `tests/unit/agendadorTick.test.js`:
  - `executarTick` com `detectar` → `{ posts: false, midia: false, tokens: false }` → resolve `0` e `chamar` não é chamado.
  - Com `{ posts: true, midia: false, tokens: true }` → `chamar` recebe exatamente `'/api/cron/process-posts'` e `'/api/cron/renew-tokens'`.
  - `chamarEndpoint` com `fetchImpl` respondendo 502, 502, 200 → `{ ok: true, status: 200, tentativas: 3 }`, `esperar` chamado com `1000` e `2000`, e o header `Authorization` é `Bearer s3gredo`.
  - `chamarEndpoint` com 401 → `{ ok: false, status: 401, tentativas: 1 }` e `esperar` não chamado (Review Focus 3).
  - `chamarEndpoint` com `fetchImpl` sempre rejeitando (erro de rede) → `{ ok: false, status: null, tentativas: 7 }`.
  - `executarTick` em que uma chamada devolve `ok: false` → resolve `1`.
- [ ] **Step 2: Run** `npx jest tests/unit/agendadorTick.test.js` — Expected: FAIL (arquivo não existe).
- [ ] **Step 3: Implement** `scripts/agendador-tick.js` (timeout por `AbortController`; log de uma linha por chamada com status e tentativas, sem o segredo) e `railway.agendador.toml`: `[build] builder = "dockerfile"`, `dockerfilePath = "Dockerfile"`; `[deploy] startCommand = "node scripts/agendador-tick.js"`, `cronSchedule = "*/5 * * * *"`, `restartPolicyType = "never"`, sem `healthcheckPath`.
- [ ] **Step 4: Run** `npx jest tests/unit/agendadorTick.test.js` e `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agendador): adiciona o tick do cron que só acorda a API quando há trabalho`

### Task 5: Front repete GET enquanto a API acorda

**Files:**
- Modify: `frontend/src/lib/api.js` (`request`, linhas 116-155)
- Test: `frontend/test/components/api.test.jsx`

**Interfaces:**
- Produces: `request` repete internamente; `apiFetch` e `publicApiFetch` mantêm a mesma assinatura e o mesmo contrato de erro.

- [ ] **Step 1: Write the failing tests** (mesmo padrão de mock de `fetch` e timers do arquivo):
  - `apiFetch('/api/me')` com `fetch` respondendo 502 e depois 200 → resolve o corpo do 200; `fetch` chamado 2 vezes.
  - `apiFetch('/api/posts', { method: 'POST', body })` com 502 → rejeita com `ApiError` de status 502 e `fetch` do endpoint chamado 1 vez (Review Focus 4).
  - GET com erro de rede 3 vezes seguidas → rejeita com `'Não foi possível conectar ao servidor.'` depois de 3 tentativas.
- [ ] **Step 2: Run** `npm run test:components -- frontend/test/components/api.test.jsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a repetição em `request` só para `GET`, com espera de 1000 ms e 3000 ms entre tentativas, respeitando `externalSignal` abortado (não repete se o chamador cancelou) e o timeout de cada tentativa.
- [ ] **Step 4: Run** `npm run test:components`, `npm run frontend:lint` e `npm run frontend:build` — Expected: PASS / sem erros.
- [ ] **Step 5: Commit** `feat(front): repete GET com 502/503 enquanto a API acorda do Sleep`

### Task 6: Rollout em produção e documentação

**Files:**
- Modify: `README.md` (seção "Deploy em produção": agendador externo, `SCHEDULER_MODE`, como reverter)
- Modify: `IA.md` (entrada datada, append-only)
- Infra: Railway (projeto `2f4d713a-453e-4613-ac47-466900a0f448`, ambiente `meuecoo-midia-production`)

- [ ] **Step 1: Push e deploy com o padrão** (`SCHEDULER_MODE` ausente). Confirmar deploy SUCCESS, `/api/config` 200 e, nos logs, o cron interno ainda rodando (nada mudou).
- [ ] **Step 2: Criar o serviço `meuecoo-midia-agendador`** (mesmo repositório e branch `main`, arquivo de config `railway.agendador.toml`) com as variáveis por referência da seção Global Constraints. Confirmar com `describe-service`: `cronSchedule = */5 * * * *`, sem domínio público, sem healthcheck.
- [ ] **Step 3: Validar o tick com a API ainda acordada:** ver nos logs de uma execução a linha de detecção e, se não houver trabalho, nenhuma chamada; criar um post de teste aprovado com horário em ~10 min numa conta de teste e ver o tick chamar `process-posts` e o post publicar. Limpar o post de teste depois.
- [ ] **Step 4: Ligar o modo externo:** `SCHEDULER_MODE=external` na API e redeploy. Confirmar no log `Agendador interno desligado (SCHEDULER_MODE=external)`.
- [ ] **Step 5: Medir o sono:** depois de ≥15 min sem uso, `list-deployments` com status `SLEEPING` ou `MEMORY_USAGE_GB` zerado; egress da API com intervalos ≥ 5 min. Abrir o app com a API dormindo e confirmar que a tela carrega (front repetindo o GET). Disparar `POST /v1/webhooks/test` da Zernio com a API dormindo e confirmar 200 em `GET /v1/webhooks/logs`.
- [ ] **Step 6: Documentar e commitar** README e IA.md com as medições (`docs: registra o agendador externo e a API dormindo em produção`), push, acompanhar deploy e CI até o estado final.
