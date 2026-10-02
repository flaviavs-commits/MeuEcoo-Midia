# Agendador externo para a API dormir de verdade — design

Data: 02/10/2026 · Autor: agente Tasks do MeuEcoo Social Media (Claude Code) · Estado: aprovado em conversa, aguardando revisão desta spec

## Objetivo

Fazer o modo Sleep (Serverless) do Railway funcionar na API `meuecoo-midia-social-api-manager`: ela deve dormir quando ninguém usa e acordar só quando houver usuário, webhook ou trabalho agendado de verdade. Critério de sucesso: em produção, a API aparece como `SLEEPING` em períodos sem uso, e posts e tarefas de manutenção continuam acontecendo.

Fora do objetivo: mudar o fluxo de publicação, agendar posts aprovados na Zernio (pode vir depois) e trocar o store do rate limit.

## Estado atual (medido em 02/10/2026)

- O Railway só põe o serviço para dormir depois de 5–10 min sem tráfego de **saída**, e conexões de banco contam (docs: deployments/serverless). O primeiro request a um serviço dormindo pode voltar 502.
- `src/services/scheduler.js:start()` roda dentro do processo web: `processarPendentes` a cada minuto (`:273`), `verificarSaudePlataformas` a cada minuto (`:289`, pinga as APIs das redes), `renovarTokensProativamente` a cada 6 h (`:280`) e `executarLimpezaMidias` a cada hora (`:285`). Resultado: egress em 181 de 181 minutos medidos, e o serviço nunca dorme.
- Já existem endpoints HTTP para cada tarefa em `src/routes/cron.js` (`/api/cron/process-posts`, `/renew-tokens`, `/media-cleanup`, `/health-check`), protegidos por `Authorization: Bearer $CRON_SECRET`. A Vercel chama `/api/cron/media-cleanup` uma vez por dia (`vercel.json`).
- Posts futuros em contas Zernio já são agendados **na Zernio** no momento da criação (`src/use-cases/posts/criarPost.js:548`); ela publica no horário exato e confirma por webhook (`/webhooks/zernio`, que acorda a API). `reservarPostsPendentes` (`src/infra/db/postsRepository.js:207`) ignora esses posts.
- O que ainda depende do tick local: posts que voltam a `scheduled` depois de aprovados (`src/routes/workspaces.js:95`), novas tentativas (`next_retry_at`), finalizações pendentes de Instagram/Zernio, primeiro comentário, recuperação de posts presos em `processing`, renovação de tokens e limpeza de mídia.
- Volume: ~2 posts/dia; 24 contas ativas, todas Zernio; nenhum post recorrente em 60 dias.
- "Publicar agora" não depende do tick: roda na própria requisição (`criarPost.js:595`).

## Arquitetura

```
                 a cada 5 min (Railway cron)
meuecoo-midia-agendador ──SELECT EXISTS──▶ Postgres
        │  só se houver trabalho
        ▼  rede privada, Bearer CRON_SECRET
meuecoo-midia-social-api-manager (/api/cron/*)  ◀── usuários, webhooks (Zernio, Stripe)
        │  SCHEDULER_MODE=external: sem node-cron
        ▼
     Postgres / Zernio / redes
```

### Componentes

1. **`SCHEDULER_MODE`** na API (`src/server.js`, onde hoje chama `scheduler.start()`): `internal` (padrão, comportamento atual, usado em desenvolvimento local) ou `external` (não chama `scheduler.start()`). Valor desconhecido → erro de configuração no startup, falhando fechado. Em produção: `external`.

2. **Detector de trabalho** — `src/services/agendadorTrabalho.js` (novo): uma função por tarefa, cada uma um `SELECT EXISTS(...)` barato que reaproveita os mesmos critérios das funções que fazem o trabalho:
   - `haPostsParaProcessar()`: o mesmo `WHERE` de `reservarPostsPendentes` (status `scheduled` vencido ou `next_retry_at` vencido, fora da fila externa da Zernio) **ou** finalização pendente de Instagram/Zernio **ou** primeiro comentário pendente **ou** post em `processing` além do limite de `recuperarPostsProcessingStale`.
   - `haMidiaParaLimpar()`: o mesmo critério de `mediaCleanupService` (`media_cleanup_after <= NOW()` e ainda não limpa).
   - `haTokensParaRenovar()`: o mesmo critério de `renovarTokensProativamente`.
   Para não duplicar SQL, os critérios saem das funções existentes como fragmentos/consultas reutilizáveis nos repositórios. O plano define exatamente onde.

3. **Tick** — `scripts/agendador-tick.js` (novo, sem Express): abre o pool, roda os detectores, fecha o pool e, para cada tarefa com trabalho, chama o endpoint correspondente:
   - posts → `GET /api/cron/process-posts`
   - mídia → `GET /api/cron/media-cleanup`
   - tokens → `GET /api/cron/renew-tokens`

   Destino: `AGENDADOR_API_URL` (produção: `http://social-api-manager.railway.internal:3000`), header `Authorization: Bearer $CRON_SECRET`. Repetição em 502/503/erro de rede/timeout com espera crescente (1, 2, 4, 8, 16, 30 s; desiste depois de ~90 s no total). 401 ou outro 4xx → não repete. Código de saída ≠ 0 se alguma chamada necessária falhou, para o Railway marcar a execução como falha. Sem trabalho → sai com 0 sem nenhuma requisição à API.

4. **Serviço Railway `meuecoo-midia-agendador`** (novo): mesmo repositório e mesma imagem Docker, config-as-code próprio em `railway.agendador.toml` (`startCommand = "node scripts/agendador-tick.js"`, `cronSchedule = "*/5 * * * *"`, `restartPolicyType = "never"`, sem healthcheck). O caminho desse arquivo é configurado no serviço, porque `railway.toml` vale para a API e definiria start e healthcheck errados. Variáveis só por referência: `DATABASE_URL=${{meuecoo-midia-social-api-manager.DATABASE_URL}}`, `CRON_SECRET=${{...CRON_SECRET}}`, `PGSSL_CA_B64`, `PGSSL_SERVER_FINGERPRINT`, `NODE_ENV=production`, `AGENDADOR_API_URL`. Nenhum token de rede social ou chave de criptografia.

5. **Health-check das redes sob demanda** — `src/services/platformHealth.js`: nova `garantirSaudeRecente(maxIdadeMin = 15)`, que só roda `verificarSaudePlataformas()` se a checagem mais recente em `platform_health` tiver mais de 15 min, com trava em memória para não rodar duas vezes em paralelo. Chamada (a) no começo de `processarPendentes` (para um `down` velho não segurar posts) e (b) em `GET /api/platform-health` (`src/server.js:438`) sem bloquear a resposta: responde o que tem e atualiza em segundo plano. O `cron.schedule('* * * * *', verificarSaudePlataformas)` continua só no modo `internal`.

6. **Frontend** — `frontend/src/lib/api.js` (`request`): requisições `GET` que recebem 502/503 ou erro de rede são repetidas até 2 vezes (espera de 1 s e 3 s). Mutações não são repetidas, para não duplicar efeito.

## Fluxo de dados

- **Sem uso:** a cada 5 min o agendador consulta o banco; nada a fazer → sai. A API fica sem tráfego e dorme depois de 5–10 min.
- **Post aprovado para as 14:00:** às 14:00–14:05 o tick encontra o post vencido e chama `process-posts`; a API acorda (repete se vier 502), publica e volta a dormir depois.
- **Post em conta Zernio:** a Zernio publica no horário; o webhook acorda a API e confirma. O primeiro comentário, se houver, sai no tick seguinte.
- **Usuário abre o app com a API dormindo:** o primeiro `GET` pode demorar ou voltar 502; o front repete e a tela carrega.

## Erros e casos de borda

- **Duas execuções sobrepostas:** o cron do Railway pula a execução se a anterior ainda estiver ativa, e `reservarPostsPendentes` já reserva atomicamente.
- **`SCHEDULER_MODE=internal` e agendador ligados ao mesmo tempo** (configuração errada): a reserva atômica evita publicação dupla; a doc de operação manda escolher um só.
- **API fora do ar por mais de 90 s:** o tick falha (aparece no Railway) e o próximo tenta de novo; o post sai atrasado, não se perde.
- **Banco inacessível no tick:** sai com erro e o próximo tenta.
- **Atraso máximo esperado** para posts que dependem do tick: ~5 min + tempo de acordar.

## Testes

- Unit — `agendador-tick`: sem trabalho, não faz nenhuma requisição; com trabalho de posts, chama só `process-posts` com o Bearer; 502 → 502 → 200 repete e sai com 0; 401 não repete e sai ≠ 0; erro de rede até esgotar → sai ≠ 0.
- Unit — detectores: cada `haX()` devolve verdadeiro/falso conforme o fixture (pool mockado, mesmo padrão dos repositórios).
- Unit — `SCHEDULER_MODE`: `external` não chama `scheduler.start()`; valor inválido falha.
- Unit — `garantirSaudeRecente`: checagem recente não pinga; velha pinga; duas chamadas simultâneas pingam uma vez só.
- Componentes — `api.js`: GET com 502 seguido de 200 resolve; POST com 502 não repete.
- Teste que falha antes: o teste de `SCHEDULER_MODE=external` falha no código atual (que sempre chama `start()`).
- Produção, depois do deploy: (1) a API chega a `SLEEPING` (status do deploy e memória zerada); (2) um post aprovado, agendado para dali a ~10 min, publica pelo tick; (3) o webhook da Zernio acorda a API e é processado; (4) abrir o app com a API dormindo carrega sem erro visível.

## Rollout e reversão

1. Deploy do código com `SCHEDULER_MODE` ausente (= `internal`): nada muda.
2. Criar `meuecoo-midia-agendador` e conferir em uma execução manual que ele detecta e chama corretamente (a API ainda está acordada).
3. Definir `SCHEDULER_MODE=external` na API e redeployar. Medir as validações de produção.
4. Reverter: remover `SCHEDULER_MODE` (volta ao `internal`) e pausar o cron do agendador.

## Custo esperado

- API: hoje ~0,19 GB médios × US$10/GB/mês ≈ US$1,90/mês de memória; dormindo na maior parte do tempo, cai para uma fração disso. O ganho real será medido no ciclo seguinte.
- Agendador: 288 execuções/dia de poucos segundos e ~100 MB → centavos por mês.
