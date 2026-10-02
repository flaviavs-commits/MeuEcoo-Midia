# Resumo da Auditoria de Segurança e Saúde Técnica

## Estado em 02/10/2026

> Atualização medida em 02/10/2026 sobre o código de `main` (`755e969e`) e a
> produção. O resumo abaixo é o registro histórico de 14/08/2026 e foi mantido
> como estava. Detalhe completo em `AUDITORIA-SEGURANCA.md`, seção "Estado em
> 02/10/2026", e na [Auditoria completa — 23/09/2026](https://app.notion.com/p/Auditoria-completa-MeuEcoo-Midia-23-09-2026-3e491f95497e8192b5bff760ea7fd5fe).

**Dos 5 achados altos de agosto, os 5 estão resolvidos:** SSRF em webhooks
(`src/utils/outboundUrl.js`), associação OAuth sem correlação
(`src/routes/oauth.js:348-353`), replay de aprovação da IA (`consumirAprovacao`),
IA fora das regras centrais de publicação (`criarPost`) e posts presos em
`processing` (0 em produção em 02/10).

**Dos médios, resolvidos:** CSRF (token de duplo envio), token de reset fora da
query string, reautenticação para configurar 2FA, migrations fail-closed, rate
limit compartilhado no Postgres (o achado S-02 da auditoria de 23/09 não procede), aprovação restrita a `owner`/`admin`/`reviewer`
e tokens OAuth temporários cifrados. **Não reverificados em 02/10:** limites
agregados de upload, paginação em todas as listagens, quota diária da IA
atômica, transações/idempotência nas operações de negócio e o envio de senha ao
Meu Ecoo no login (`src/routes/auth.js:112`, comportamento ainda presente).

**Dos baixos:** `Content-Security-Policy` já é aplicada em produção.

**Infraestrutura:** o proxy TCP público do Postgres foi removido e a senha do
banco rotacionada em 02/10; o webhook da Zernio voltou a funcionar em 02/10
(estava desativado desde 14/09 por um espaço no nome da variável). O domínio
`meuecoomidia.com.br` não respondeu nos testes de 02/10 (DNS aponta para um IP
que recusa conexão) — task urgente aberta.

**Testes e dependências em 02/10:** 67 suítes / 717 testes backend aprovados;
`npm audit --omit=dev` passou a acusar 2 vulnerabilidades altas (`nodemailer`,
`undici`) e 1 moderada (`ip-address`), todas com correção disponível.

**Em aberto:** Row-Level Security (0 de 50 tabelas), dependências vulneráveis,
DNS do domínio, segredos copiados no serviço do banco, `OPENAI_API_KEY` com
quebra de linha, erros `Account not found` da Zernio, validação da réplica
única e redução do volume do Postgres — todos com task no Notion.

## Escopo

Auditoria ampla do backend Express/Node, frontend React/Vite, PostgreSQL, autenticação, OAuth, uploads, integrações sociais, deploy Vercel/Railway, dependências, portas locais, produção e logs disponíveis.

O working tree estava significativamente modificado e não foi possível confirmar que todos os arquivos locais correspondem exatamente ao código implantado.

## Conclusão executiva

Foram identificados 5 achados altos, 13 médios e 4 baixos. Não foram encontrados segredos versionados, CVEs nas dependências de produção, SQL injection, XSS direto ou IDOR confirmado.

Há cinco prioridades imediatas:

1. Corrigir SSRF no cadastro de webhooks.
2. Remover o fallback OAuth que escolhe a conta Zernio mais recente.
3. Fazer a IA usar a mesma validação do fluxo manual de posts.
4. Tornar tokens de aprovação do agente de uso único.
5. Investigar 7 posts presos em `processing` desde 03/08/2026.

## Principais achados

### Alto

- **SSRF em webhooks** — `src/routes/webhooks.js` e `src/services/webhookService.js`. Usuários podem cadastrar destinos HTTPS arbitrários e fazer o servidor realizar POSTs internos ou externos. Aplicar allowlist, bloqueio de redes privadas, proteção contra DNS rebinding e redirects.
- **Associação OAuth insegura** — `src/routes/oauth.js:303-313`. Sem ID remoto inequívoco, o sistema escolhe a conta Zernio mais recente, podendo vincular a conta errada. Falhar fechado quando não houver correlação segura.
- **Replay de aprovação da IA** — `src/utils/authToken.js:49-63` e `src/routes/ai.js:1825-1840`. O token expira em 5 minutos, mas não é consumido uma única vez. Persistir nonce e consumir atomicamente.
- **IA bypassa regras centrais de publicação** — `src/routes/ai.js:1901-1987`. O fluxo grava posts diretamente, divergindo do agendador manual em regras de TikTok, YouTube, datas e limites. Reutilizar o caso de uso central de criação de posts.
- **Posts presos em processamento** — banco configurado pela aplicação. Foram encontrados 7 posts em `processing`, o mais antigo desde `2026-08-03T18:57:03Z`, sem publicação correspondente. Criar timeout, reconciliação e idempotência.

### Médio

- Proteção CSRF incompleta com cookie `SameSite=None` e aceitação de requisições mutáveis sem `Origin`.
- Tokens de redefinição expostos em query string, em `src/routes/auth.js` e no frontend.
- Configuração de 2FA sem reautenticação recente, em `src/routes/me.js`.
- Migrações de banco falham silenciosamente e o servidor continua iniciando, em `src/db/runtimeMigrations.js` e `src/server.js`.
- Uploads e processamento de mídia sem limite agregado de quantidade, memória e concorrência.
- Consultas sem paginação em posts, drafts, ativos, filas e contas.
- Limite diário da IA sujeito a corrida entre leitura e incremento.
- Rate limits mantidos apenas em memória.
- Qualquer membro do workspace pode aprovar conteúdo, apesar da existência do papel `reviewer`.
- Senha do usuário é enviada em texto para o sistema externo Meu Ecoo após login.
- Tokens OAuth temporários são armazenados sem criptografia na tabela de pendências.
- Operações de negócio em múltiplas etapas não usam transação ou idempotência suficiente.
- PostgreSQL local escuta em `0.0.0.0:5432`. O banco da aplicação parece ser hospedado separadamente, portanto a exposição do banco de produção não foi confirmada.

### Baixo

- Ausência de `Content-Security-Policy`.
- Prefixos de tokens são retornados para a interface sem necessidade.
- Algumas mensagens de erro de provedores externos chegam diretamente ao cliente.
- Dependências possuem atualizações disponíveis, embora `npm audit --omit=dev` tenha retornado zero vulnerabilidades.

## Infraestrutura verificada

- Domínio público `/api/config`: HTTP 200.
- Railway `/health`: HTTP 200, aproximadamente 449 ms.
- API sem credencial: `/api/v1/posts` retornou 401.
- Rota administrativa sem credencial: retornou 401.
- TLS público válido.
- PostgreSQL conectado pela aplicação: PostgreSQL 18.4, aproximadamente 19 MB, uma sessão ativa, zero sessões aguardando, SSL ativo e timeout de consulta de 30 segundos.
- A rota pública `/health` no domínio Vercel retorna 404 porque não existe rewrite para ela; o healthcheck configurado no Railway usa `/api/config`.

## Testes e dependências

- Testes backend: 393 aprovados.
- Testes de componentes: 59 aprovados.
- Build do frontend: concluído.
- `npm audit --omit=dev`: 0 vulnerabilidades reportadas.

## Logs e sinais de abuso

Nos últimos 7 dias foram encontrados 582 eventos `ok`, 83 `info` e 64 `err`. Não apareceram padrões textuais compatíveis com injection, traversal ou scan automatizado. Não há access log centralizado com IP/origem disponível; portanto não foi possível fazer análise forense por IP ou usuário.

Não há evidência de comprometimento.

## Verificações não concluídas

Não foi possível verificar, por falta de CLI/dashboard autenticado, CPU, memória, uptime, backups recentes, filas externas, dependências externas e histórico completo de erros do Railway/Vercel. Essas informações continuam em aberto.

## Ordem recomendada de correção

1. SSRF de webhooks e associação OAuth.
2. Validação única de posts e aprovação IA de uso único.
3. Recuperação dos posts presos em `processing`.
4. CSRF, reset de senha e reautenticação de 2FA.
5. Limites de upload, paginação, quotas atômicas e rate limiting compartilhado.
6. Migrações fail-closed, transações e idempotência.
7. Restrição do PostgreSQL local e revisão do compartilhamento de senhas com o Meu Ecoo.

