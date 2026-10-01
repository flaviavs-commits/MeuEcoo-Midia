# Páginas e funções do Meu Ecoo Mídia

Documento funcional e técnico das telas disponíveis no frontend. A finalidade é explicar o que cada página resolve para o usuário, quais ações oferece, quais dados utiliza e como se relaciona com os demais módulos.

## 1. Visão geral do produto

O Meu Ecoo Mídia é um gerenciador de redes sociais. O fluxo principal é:

1. Criar uma conta ou entrar.
2. Conectar Instagram, Facebook, YouTube e/ou TikTok.
3. Criar, revisar, salvar, agendar ou publicar conteúdo.
4. Acompanhar calendário, histórico, comentários e métricas reais.
5. Organizar mídias, rotinas recorrentes, equipe e links públicos.

O frontend usa navegação interna em `/app/<modulo>`. O `App` em `frontend/src/main.jsx` identifica a URL, busca o usuário atual e entrega as páginas dentro do `AppShell`.

## 2. Mapa de rotas

| URL | Página (nome no menu) | Finalidade |
|---|---|---|
| `/` | Landing page | Apresentar o produto e direcionar para login/painel. |
| `/login.html` | Login e cadastro | Entrar, criar conta, recuperar senha e concluir 2FA. |
| `/reset-password.html` | Redefinição de senha | Validar token e criar nova senha. |
| `/verify-2fa.html` | Verificação 2FA | Confirmar o código temporário após o login. |
| `/app.html` e `/app/dashboard` | Início | Visão geral da operação do usuário. |
| `/app/agendador` | Meu Post | Produzir, revisar, salvar, agendar e publicar posts. |
| `/app/calendario` | Calendário | Visualizar e reagendar publicações. |
| `/app/rascunhos` | Baú de Ideias | Guardar ideias, rascunhos e modelos e gerar ideias novas. |
| `/app/analytics` | Relatórios | Analisar desempenho real das redes e publicações. |
| `/app/inbox` | Inbox | Acompanhar e responder comentários/interações. |
| `/app/integracoes` | Contas | Conectar, reconectar e desconectar redes sociais. |
| `/app/seguranca` | Segurança | Configurar ou remover autenticação em dois fatores. |
| `/app/atividade` | Atividades | Consultar e limpar o histórico operacional. |
| `/app/ai` | Assistente inteligente | Gerar ideias, imagens, análises e publicações assistidas. |
| `/app/perfil` | Perfil | Editar dados pessoais, senha, avatar, preferências, plano e sessões. |
| `/app/biblioteca` | Biblioteca | Armazenar, buscar, organizar e reutilizar arquivos. |
| `/app/filas` | Repetidor de posts | Criar rotinas automáticas de publicação. |
| `/app/smartlinks` | Smartlinks | Criar páginas públicas de links rastreáveis. |
| `/app/equipe` | Equipe (atrás de flag) | Organizar clientes/marcas, membros, aprovações e identidade visual. |
| `/admin.html` | Administração | Gerenciar usuários, cobrança, histórico e indicadores da plataforma. |

A tela de Tokens (seção 7.2) existe no código, mas não tem rota no conjunto atual de páginas (`frontend/src/lib/app-pages.js`); decidir se volta é uma pendência de produto.

`/app/automacoes` não faz parte do conjunto atual de módulos ativos. Existe uma compatibilidade que redireciona essa URL para o dashboard.

## 3. Estrutura compartilhada

### `AppShell`

Arquivo: `frontend/src/components/layout/app-shell.jsx`

É a moldura das páginas autenticadas, no design system (DS) de `frontend/src/styles/ds/`. Ela fornece:

- Menu lateral com as áreas agrupadas (Criar, Conteúdo, Automações, Engajamento, Conta), que pode ser recolhido em trilho de ícones.
- Topbar com página atual, atalhos, notificações, "Criar post" e menu da conta (tema, perfil, sair). No celular, a barra mostra a marca do app enquanto o título da página está visível e passa a mostrar o título quando a pessoa rola.
- Barra inferior no celular (Início, Criar, Calendário, Inbox e "Mais", que abre uma folha com as outras áreas).
- Link "Pular para o conteúdo" e foco levado ao conteúdo a cada troca de página.
- Atalhos de teclado: `C` para criar post, `D` para o Início, `?` para ajuda e `Esc` para fechar janelas.
- Tutorial guiado, que devolve o foco a quem o abriu.
- Widget do Assistente IA disponível durante a navegação (folha no celular; recolhe ao rolar e, no celular, enquanto um campo tem foco).

**Peças compartilhadas do DS** (`frontend/src/components/ui/`), usadas pelas páginas:

- `Sheet` e `Popover` (`floating.jsx`): diálogo ou folha inferior no celular, com foco preso, `Esc` e retorno do foco. Camadas abertas uma sobre a outra formam uma pilha: só a de cima responde a `Esc` e `Tab`.
- `OverflowMenu`: o "…" de cada item; menu ancorado no desktop, folha de ações no celular; devolve o foco ao "…".
- `FiltersButton` + `FilterSheet`: filtros de celular num rascunho que só vale depois de "Aplicar filtros".
- `DateTimeField` e `TimeField`: data e hora no fuso do aparelho (o fuso aparece na dica); calendário e hora lado a lado no desktop e folha no celular.
- `NetworkGlyph`, `PasswordInput`, `useToast`, `useApiResource` (uma carga nova começa sem o erro da anterior).

**Regras de layout:** uma única rolagem por tela; `sticky`/`fixed` só em elementos globais (topbar, sidebar, barra inferior, widget, toasts, camadas) e na barra de ação do Meu Post no celular; alvos de toque de 44 px no celular; campos com 16 px no celular.

### Navegação e carregamento

`frontend/src/main.jsx` controla:

- A seleção da tela conforme a URL.
- O redirecionamento de módulos não disponíveis.
- A busca de `/api/me` para preencher usuário e avatar.
- O histórico do navegador com `pushState` e `popstate`.
- O carregamento inicial do tema.

`frontend/src/pages/module-page.jsx` carrega os módulos com `lazy`/`Suspense`, reduzindo o bundle inicial. `/admin.html` também é carregada sob demanda (só administradores a abrem). Se um tipo não possuir página registrada, exibe um placeholder de módulo.

## 4. Páginas públicas e autenticação

### 4.1 Landing page

Arquivo: `frontend/src/pages/landing-page.jsx`

**Para que serve:** apresentar o Meu Ecoo Mídia antes do login.

**Funções de negócio:**

- Explicar a proposta de conectar, criar, agendar e crescer.
- Direcionar o visitante para login/cadastro.
- Disponibilizar links institucionais, como privacidade e termos.

Não consulta dados privados nem cria registros.

### 4.2 Login e cadastro

Arquivo: `frontend/src/pages/auth-page.jsx` — componente `LoginPage`.

**Para que serve:** entrar e criar conta na mesma tela. Entrar, criar conta,
esqueci a senha, link enviado, código 2FA e aviso de senha curta são etapas de
uma única superfície; a troca não recarrega a página.

**Endereços:**

- `/login.html` — entrar.
- `/login.html?mode=signup[&plan=basico|pro|premium]` — criar conta. O link
  antigo `?register=1` continua funcionando e vira `?mode=signup`.
- `/login.html?mode=forgot` — pedir o link de redefinição.
- `?next=<página>` — página do app para voltar depois de entrar (ex.:
  `?next=calendario`). Só aceita a chave de uma página conhecida
  (`frontend/src/lib/app-pages.js`), nunca uma URL. `apiFetch` usa isso quando
  a sessão expira no meio do uso.
- `?error=` — só mensagens conhecidas do callback do Google são exibidas; o
  parâmetro sai da barra de endereço em seguida.

**Funções:**

- Alternar entre entrar e criar conta mantendo o e-mail digitado (a senha é limpa).
- Validar e-mail e senha por campo, com mensagem ligada ao campo (`aria-describedby`).
- Mostrar os requisitos da senha no cadastro (mesmas regras do servidor).
- Mostrar/ocultar a senha com o componente `PasswordInput` (`components/ui/password-input.jsx`).
- Fazer login; criar conta com nome opcional e seguir para o checkout do plano.
- Continuar com Google (secundário ao e-mail e senha).
- Pedir o link de redefinição sem revelar se o e-mail tem conta.
- Confirmar o código 2FA quando a conta exige.
- Avisar sobre senha antiga curta, sem redirecionamento automático.
- Levar ao perfil quando o plano não está ativo; senão, à página de origem ou ao painel.
- Tirar da tela de login quem já tem sessão (consulta `GET /api/me` só quando
  este navegador já abriu o app — marca `meu-ecoo:session-hint`, sem valor de credencial).

**APIs principais:**

- `POST /auth/login/login`
- `POST /auth/login/register`
- `POST /api/billing/plan-change` (checkout logo após o cadastro)
- `POST /auth/login/verify-2fa`
- `POST /auth/login/forgot-password`
- `GET /auth/login/google` via link de OAuth.
- `GET /api/me` (somente para redirecionar quem já está conectado).

**Depende do backend / fora da interface:**

- O login com Google não carrega o `?next=`: o destino final é decidido no
  callback (`src/routes/auth.js`), que manda para `/app.html` ou `/app/perfil`.
- `POST /auth/login/reset-2fa` (redefinir a senha com o código do app
  autenticador) existe no backend, mas nunca teve entrada na interface. Segue
  sem botão até haver decisão de produto.
- Quais domínios de e-mail podem entrar é configuração do servidor
  (`ALLOWED_EMAIL_DOMAINS`); a tela mostra a mensagem que o servidor devolver.

### 4.3 Redefinição de senha

Arquivo: `frontend/src/pages/auth-page.jsx` — componente `ResetPasswordPage`.

**Para que serve:** trocar a senha a partir do token recebido por e-mail.

**Funções:**

- Ler o token da URL (hash ou query) e tirá-lo da barra de endereço.
- Validar se o token ainda é utilizável; falha de rede mostra "Tentar de novo"
  em vez de declarar o link vencido.
- Exibir os requisitos da senha em tempo real.
- Confirmar a nova senha (cada campo com o próprio mostrar/ocultar).
- Salvar a nova senha e oferecer "Entrar".
- Link vencido: oferece pedir um novo (`/login.html?mode=forgot`).

**APIs:**

- `POST /auth/login/reset-password/validar`
- `POST /auth/login/reset-password`

### 4.4 Verificação em dois fatores

Arquivo: `frontend/src/pages/auth-page.jsx` — componente `VerifyTwoFactorPage`.

**Para que serve:** concluir o login com Google quando a conta possui 2FA ativo
(o backend redireciona para cá com um cookie de confirmação pendente).

**Funções:**

- Aceitar somente código numérico de seis dígitos.
- Confirmar o código.
- Redirecionar para `/app/perfil` se o plano não está ativo; senão, `/app.html`.
- Código incorreto aparece no campo; etapa vencida oferece entrar de novo.

**API:** `POST /auth/login/verify-2fa`.

## 5. Início (dashboard)

Arquivo: `frontend/src/pages/dashboard-page.jsx`

**Para que serve:** oferecer uma visão operacional rápida da conta autenticada.

**Dados carregados:**

- Publicações em `GET /api/posts`.
- Contas em `GET /api/accounts`.
- Métricas em `GET /api/posts/analytics?days=7|15|30` (tempo limite de 45 s e novas tentativas automáticas).

**Ordem da tela:** números da conta → "Precisa de atenção" → "Próximos agendamentos" → "Desempenho" → "Publicações recentes" ao lado de "Redes conectadas".

**Funções para usuários com dados:**

- Mostrar total de publicações, agendadas (com aviso das que estão sem horário), falhas (com atalho "Revisar abaixo") e contas conectadas.
- "Precisa de atenção": falhas que podem ser corrigidas, com o motivo, "Como resolver", "Revisar no editor" e "Excluir alerta" no "…" (depois de excluir, o foco vai para o alerta seguinte); agendamentos sem horário com "Corrigir agenda".
- "Próximos agendamentos": até 4, em faixa (4 colunas no desktop, 2 no tablet, lista no celular); vazio com "Agendar agora".
- "Desempenho" por rede e por período (7, 15 ou 30 dias): visualizações, interações e taxa; gráficos e tabela "Ver valores" que cobrem o período inteiro (até 8 dias com publicação, uma coluna por dia; acima disso, uma por semana, a partir de segunda); destaques do período; "Leituras do período" (conteúdo, horário e próximo teste) só depois que as métricas chegam.
- Listar publicações recentes com busca e filtros por status.
- Mostrar redes conectadas e atalho para Contas.

**Estados:** cada seção mostra esqueleto enquanto carrega e erro próprio quando falha (nenhuma diz "vazio" antes de saber). As redes de cada item também vão em texto para leitor de tela.

**Estado inicial sem dados:**

Quando não há contas nem publicações, a tela mostra apenas um estado vazio limpo. Não são exibidos números, gráficos, rankings, insights ou dados demonstrativos. O usuário recebe ações para:

- Conectar a primeira conta.
- Criar a primeira publicação.

O checklist de onboarding continua orientando a sequência inicial.

**Funções auxiliares relevantes:**

- `failureDiagnosis`: classifica uma falha como sistema, rede/conexão, conteúdo/configuração ou origem inconclusiva.
- `bestObservedHour` e `bestProviderTime`: calculam uma janela de horário somente quando existem dados reais.
- `reviewFailure`: reaproveita o conteúdo que falhou no editor.

## 6. Operação de conteúdo

### 6.1 Meu Post (criador de posts)

Arquivo: `frontend/src/pages/scheduler-page.jsx`

**Para que serve:** ser o centro de criação e publicação multiplataforma.

**Interface:** quatro seções em sequência (Redes, Conteúdo, Mídia, Publicação). No desktop, a prévia fica ao lado; no celular, abre numa folha ("Prévia"), e uma barra de ação fixa no rodapé mostra o estado ("Pronto para agendar", pendências) e o botão principal. As pendências abrem numa folha que leva ao campo com problema.

**Funções:**

- Escrever texto por plataforma.
- Escolher Instagram, Facebook, YouTube e TikTok.
- Escolher contas conectadas específicas.
- Publicar imediatamente ou agendar (data e hora no fuso do aparelho, com o fuso na dica).
- Fazer upload de imagens e vídeos.
- Pré-visualizar o conteúdo por rede.
- Configurar título, visibilidade, categoria e público infantil no YouTube.
- Configurar formato do Instagram.
- Configurar privacidade e restrições de comentários, duetos e stitches no TikTok.
- Usar mídia da biblioteca.
- Analisar imagem/vídeo com IA e receber sugestões de legenda e hashtags por rede.
- Salvar rascunho local e autosave no servidor.
- Salvar conteúdo como modelo ("…" no celular).
- Enviar para aprovação de uma equipe quando houver espaço de trabalho.
- Acompanhar progresso da publicação e eventos do backend.
- Exibir erros por etapa, sem perder o conteúdo digitado; um clique duplo não publica duas vezes.

**APIs principais:**

- `GET /api/accounts`
- `POST /api/posts/upload-url`
- `POST /api/posts`
- `GET/POST/PATCH/DELETE /api/drafts...`
- `GET /api/logs/events/since/:cursor`
- `POST /api/ai/analyze-media`
- `GET /api/workspaces` e `POST /api/workspaces/:id/approvals`

### 6.2 Baú de Ideias (rascunhos e modelos)

Arquivo: `frontend/src/pages/drafts-page.jsx`

**Para que serve:** guardar ideias, rascunhos automáticos e modelos, e gerar ideias novas com IA.

**Interface:** cabeçalho com uma linha de contagem ("15 ideias salvas · 2 modelos · 4 com mídia"); logo abaixo, o composer "Gerar novas ideias" no fluxo da página (não acompanha a rolagem); depois as ideias em cartões (2 colunas a partir de 1200 px, 1 abaixo), cada um com tipo e "…" no topo, título, resumo de 3 linhas, redes e "Criar post".

**Funções:**

- Gerar 3 ideias para o Instagram a partir de um tema (até 4000 caracteres, o limite do gerador); o campo cresce enquanto a pessoa escreve.
- Listar ideias geradas, rascunhos automáticos e modelos.
- Buscar por texto, título ou rede.
- Filtrar por tipo (Todas, Em andamento, Modelos) — em folha no celular.
- Ver o texto completo de uma ideia (links longos quebram a linha).
- Reabrir a ideia no Meu Post.
- Excluir uma ideia (o foco vai para a ideia seguinte) e esvaziar o Baú.

**APIs:** `GET/POST/DELETE /api/drafts`, `DELETE /api/drafts/:id` e `POST /api/ai/generate`.

### 6.3 Calendário

Arquivo: `frontend/src/pages/calendar-page.jsx`

**Para que serve:** visualizar o planejamento editorial e ajustar horários.

**Funções:**

- Navegar por mês (‹ Hoje ›).
- Alternar entre calendário e lista.
- Filtrar por rede (folha de filtros no celular).
- Abrir as publicações de um dia numa folha.
- Ver mídia, texto, plataformas e status em palavras (inclui "Aguardando confirmação" para publicações já vencidas sem retorno).
- Editar a data e o horário de uma publicação agendada.
- Arrastar uma publicação para outro dia.
- Copiar uma publicação para outro dia e reagendar uma tentativa ("…" de cada publicação); uma cópia por clique.
- Excluir uma publicação.
- Exibir mensagens amigáveis de erro de publicação.

**APIs:**

- `GET /api/posts/calendar?year=...&month=...`
- `GET /api/posts?status=scheduled&limit=100`
- `PATCH /api/posts/:id` com `scheduledAt`.
- `POST /api/posts/:id/repeat`
- `DELETE /api/posts/:id`

As preferências de visualização (calendário ou lista e rede) ficam salvas no `localStorage` do dispositivo.

### 6.4 Repetidor (filas recorrentes)

Arquivo: `frontend/src/pages/content-queues-page.jsx`

**Para que serve:** automatizar conteúdos que se repetem em dias e horários definidos.

**Interface:** cada rotina é um cartão com nome, estado em palavras e ícone e "…" no topo, um trecho de 2 linhas e, no rodapé, horário · dias, próxima publicação, redes e a ação principal (Ativar/Pausar). "Nova rotina" abre numa folha; a primeira rotina é criada na própria tela. No celular, busca + "Filtros" (situação).

**Funções:**

- Criar uma rotina com nome, texto, mídia opcional e redes.
- Selecionar dias da semana.
- Definir horário (`TimeField`, 24 h; o envio continua `HH:mm`).
- Ativar ou pausar uma rotina (o estado muda depois da confirmação do servidor).
- Excluir uma rotina, com confirmação.
- Visualizar próxima execução e situação atual.
- Buscar e filtrar por situação.

**APIs:**

- `GET /api/content-queues`
- `POST /api/content-queues`
- `PATCH /api/content-queues/:id`
- `DELETE /api/content-queues/:id`
- `POST /api/posts/upload-url` (mídia da rotina)

### 6.5 Biblioteca de mídia

Arquivo: `frontend/src/pages/media-library-page.jsx`

**Para que serve:** centralizar arquivos reutilizáveis e reduzir retrabalho na criação.

**Interface:** grade de mídias em que a imagem conduz o cartão (2 colunas no celular, até 320 px). Tocar a mídia abre uma prévia (imagem inteira ou vídeo com controles, pasta, tamanho, tags, "Remover" e "Usar no Meu Post"). O "…" de cada mídia tem "Visualizar" e "Remover da biblioteca" (e, no celular, "Usar no Meu Post").

**Funções:**

- Listar imagens e vídeos do usuário, com "Carregar mais mídias".
- Buscar por nome ou tag (a consulta espera uma pausa na digitação).
- Filtrar por pasta (chips com contagem no desktop; folha de filtros no celular).
- Criar pastas.
- Fazer upload com URL assinada para a pasta escolhida (no celular, "Adicionar mídia" abre uma folha com a pasta de destino).
- Visualizar a mídia.
- Excluir mídia (o foco vai para a mídia seguinte).
- Selecionar mídia e devolvê-la ao Meu Post.
- Gerar sugestões de conteúdo a partir de nicho, período, redes e analytics.
- Transformar uma sugestão da IA em ideia no Baú.

**Estados:** falha ao carregar mostra erro com "Tentar novamente" (nunca a estante vazia); contagens das pastas só aparecem depois de carregadas.

**APIs:**

- `GET/POST /api/media-assets`
- `DELETE /api/media-assets/:id`
- `GET/POST /api/media-folders`
- `POST /api/posts/upload-url`
- `GET /api/ai/analytics-insights?days=...`
- `POST /api/ai/generate`
- `POST /api/drafts`

## 7. Contas, acesso e segurança

### 7.1 Contas conectadas

Arquivo: `frontend/src/pages/accounts-page.jsx`

**Para que serve:** gerenciar as contas sociais autorizadas a publicar e fornecer métricas.

**Interface:** um bloco por rede (logo, contas conectadas dentro, ação de conectar/reconectar e saúde da API). Cada conta mostra avatar, data de conexão e o estado do token em palavras e ícone ("Válido até", "Expira em", "Expirou em", "Erro no token", "Sem token"). Abaixo, o formulário "Adicionar ou remover conta".

**Funções:**

- Exibir Instagram, Facebook, YouTube e TikTok, com as redes fora do plano bloqueadas ("Ver planos").
- Conectar a primeira conta, adicionar outra da mesma rede ou reconectar uma com token inválido (o link da conta a reconectar já vem preenchido).
- Reconhecer a rede de um link colado e sugerir trocar a plataforma ("Usar TikTok").
- Pesquisar contas e filtrar por status do token (folha de filtros no celular).
- Ver saúde operacional da API de cada rede.
- Abrir o perfil público da conta quando houver URL.
- Desconectar uma conta (com confirmação).
- Mostrar o resultado da autorização no topo da página ao voltar do provedor (sucesso, cancelada ou falha).

**Estados:** falha ao carregar a lista mostra erro com "Tentar de novo" e mantém números e blocos em "—"; uma rede só fica verde quando todas as contas dela têm token válido.

**APIs:**

- `GET /api/accounts`
- `GET /api/platform-health`
- `GET /auth/:provider?...` para iniciar OAuth.
- `DELETE /api/accounts/:id`

### 7.2 Tokens

A tela de Tokens saiu do app em 31/08/2026 (commit `9326eb3`): a rota `/app/tokens` deixou de existir e o arquivo `tokens-page.jsx`, que tinha ficado sem uso, foi apagado na auditoria de 01/10/2026. A situação de cada conexão aparece em Contas (7.1). Endereços antigos como `/app/tokens` caem na página "Página não encontrada", e o assistente leva para Contas quando sugere "tokens". As rotas `/api/tokens*` continuam no backend, sem tela que as use.

### 7.3 Segurança

Arquivo: `frontend/src/pages/security-page.jsx`

**Para que serve:** proteger o acesso com autenticação em dois fatores.

**Funções:**

- Mostrar se o 2FA está ativo.
- Gerar QR Code e chave manual (com "Copiar chave"); no celular e no tablet, "Abrir no app autenticador".
- Confirmar o primeiro código do autenticador.
- Ativar o 2FA.
- Desativar o 2FA com um código atual, numa área neutra "Gerenciar 2FA" (o vermelho fica só no botão da ação).
- Explicar o uso de Google Authenticator, Authy ou equivalente.

Depois de ativar ou desativar, o foco vai para o título do bloco novo; cada erro aparece uma vez, junto do campo.

**APIs:**

- `POST /api/me/2fa/setup`
- `POST /api/me/2fa/enable`
- `POST /api/me/2fa/disable`

### 7.4 Perfil

Arquivo: `frontend/src/pages/profile-page.jsx`

**Para que serve:** administrar identidade, preferências, plano e sessão do usuário.

**Funções:**

- Alterar nome.
- Escolher fuso horário, idioma e plataforma padrão.
- Configurar notificações de e-mail, publicação, falha e comentários.
- Fazer upload ou remover avatar.
- Alterar senha (campos com mostrar/ocultar, como no login).
- Ver o plano, trocar de plano e abrir o portal de cobrança.
- Consultar o limite diário de IA do plano gratuito.
- Ir rapidamente para contas, tokens e atividades.
- Encerrar a sessão atual.
- Encerrar todas as sessões (o botão fica desativado enquanto encerra).

A navegação entre seções só acompanha a rolagem a partir de 1024 px (exceção aceita); no celular os atalhos têm 44 px. Cada erro aparece uma vez, junto do formulário, e o que foi digitado fica.

**APIs:**

- `GET/PATCH /api/me/profile`
- `POST /api/me/password`
- `POST /api/me/avatar`
- `POST /api/me/logout-all`
- `GET /api/billing/status`, `POST /api/billing/plan-change`, `POST /api/billing/portal`
- `GET /api/ai/demo-status`
- `POST /api/posts/upload-url`

## 8. Monitoramento e relacionamento

### 8.1 Relatórios (analytics)

Arquivos: `frontend/src/pages/analytics-page.jsx`, `frontend/src/hooks/use-analytics.js` e `frontend/src/components/analytics/*`.

**Para que serve:** transformar métricas reais das redes em leitura de desempenho.

**Interface:** barra de filtros (rede, período, comparação, atualização e o recorte usado no CSV/PDF), resumo, relatório da rede escolhida, visão executiva e perfis conectados. Escolher uma rede pela lista do fim da página, pelo "Ver rede" do comparativo ou pelo "Ver relatório" de um perfil rola até o que abriu e leva o foco ao título. No celular: redes como logos de 44 px (nome para leitor de tela) e "Todas" curto; exportar (CSV, Imprimir/PDF) num único menu; o comparativo por rede vira um bloco por rede. Tabelas diárias rolam só na horizontal e as listas demográficas mostram todas as linhas.

**Funções:**

- Selecionar a rede analisada.
- Alternar abas de comunidade, conteúdo e audiência.
- Escolher período de 7, 30 ou 90 dias.
- Comparar com o período anterior (até 30 dias; a comparação não fica salva — rede e período, sim).
- Exibir resumo executivo.
- Exibir métricas por conta.
- Exibir visualizações, curtidas, comentários, compartilhamentos e salvamentos.
- Exibir crescimento de seguidores/inscritos.
- Exibir evolução diária (cada gráfico tem nome acessível com os valores).
- Exibir melhores horários.
- Exibir decadência de conteúdo.
- Exibir demografia agregada quando a API oficial fornece.
- Exibir vídeos do TikTok.
- Abrir relatório detalhado de uma conta.
- Exportar CSV.
- Gerar versão imprimível/PDF pelo navegador.
- Configurar relatórios agendados por e-mail (folha do DS, com foco preso e devolvido ao botão).
- Atualizar automaticamente a cada 15 minutos enquanto a aba está visível, e por "Atualizar".

**Estados:** sem redes porque uma fonte falhou (contas ou TikTok), a página diz que a conferência falhou, lista as fontes e oferece "Tentar novamente" (em vez de "Conecte uma rede"). Métrica ausente aparece como "—".

**APIs e fontes:**

- `GET /api/posts/analytics?days=...`
- `GET /api/accounts`
- `GET /api/posts/tiktok-videos`
- APIs oficiais das plataformas e/ou Zernio no backend.
- `GET/POST/PATCH/DELETE /api/report-schedules...` no painel de relatórios agendados.

O módulo não deve inventar métricas. Sem conexão ou sem dados reais, mostra estado vazio e limitações da fonte.

### 8.2 Inbox

Arquivo: `frontend/src/pages/inbox-page.jsx` (a conversa é `frontend/src/components/analytics/comments-modal.jsx`, também usada em Relatórios).

**Para que serve:** concentrar comentários e interações que precisam de resposta.

**Interface:** no desktop, lista de publicações ao lado da conversa (os dois painéis rolam separados — a exceção documentada à regra de uma rolagem). Em telas até 1023 px, a lista abre a conversa numa tela própria, com "Publicações" para voltar (o voltar do aparelho também funciona e devolve a lista na mesma posição e com os mesmos filtros).

**Funções:**

- Listar publicações com comentários (inclusive publicações de fora do app, via redes conectadas).
- Filtrar por plataforma e por situação de resposta; pesquisar (no celular, filtros numa folha).
- Abrir a conversa de uma publicação, com a prévia da publicação e das mídias.
- Marcar comentários como vistos ao abrir a conversa.
- Responder comentários quando a plataforma permitir, e salvar respostas prontas para reutilizar.
- Atualizar a conversa a cada minuto e ao voltar para a janela; se uma atualização falhar, a conversa carregada e os rascunhos de resposta continuam na tela, com um aviso discreto.

**APIs:**

- `GET /api/posts/inbox`
- `GET /api/posts/inbox/unread`
- `GET /api/posts/:id/comments`, `POST /api/posts/:id/comments/seen`, `POST /api/posts/:id/comments/:commentId/reply`
- `GET /api/posts/inbox/remote-comments` e `POST /api/posts/inbox/remote-comments/reply`
- `GET/POST /api/saved-texts`

### 8.3 Central de atividades

Arquivo: `frontend/src/pages/activity-page.jsx`.

**Para que serve:** fornecer uma trilha operacional auditável.

**Funções:**

- Listar até 200 eventos recentes.
- Filtrar por tipo: sucesso, erro, aviso e informação (no celular, "Filtros" abre uma folha com as contagens).
- Pesquisar mensagens.
- Ler mensagens longas por inteiro ("Ver mais"/"Ver menos" só quando o texto foi cortado).
- Atualizar o histórico.
- Limpar todo o histórico após confirmação (uma falha aparece como aviso da própria ação e a lista fica).
- Identificar plataforma e horário do evento.

**APIs:**

- `GET /api/logs?limit=200`
- `DELETE /api/logs`

## 9. Assistente e conversão

### 9.1 Assistente IA

Arquivo: `frontend/src/pages/ai-page.jsx`.

**Para que serve:** apoiar planejamento, produção e publicação de conteúdo.

**Interface:** o compositor vem primeiro, sem acompanhar a rolagem, e as ideias depois, numa coluna de até 880 px. Depois de gerar, a página rola até "Sugestões" e leva o foco para lá. A escolha da rede para publicar abre numa folha.

**Funções:**

- Receber uma instrução de conteúdo (até 4000 caracteres).
- Gerar até três ideias/postagens.
- Gerar mais ideias sem apagar as anteriores.
- Escolher o modelo de IA.
- Editar o texto gerado.
- Gerar imagem para uma ideia (formato em duas opções; a explicação do carrossel aparece quando ele é escolhido).
- Publicar uma ideia com imagem gerada.
- Escolher plataforma e conta compatível.
- Bloquear YouTube quando a mídia não for vídeo.
- Agendar/publicar pelo fluxo assistido, acompanhando o progresso.
- Consultar e limpar a atividade do agente.
- Consultar analytics e diagnósticos de desempenho.
- Mostrar comparações, amostra e nível de confiança quando houver dados.

**Widget flutuante** (`frontend/src/components/ai/ai-assistant-widget.jsx`): conversa rápida em qualquer página; no celular abre numa folha; recolhe ao rolar para baixo e, no celular e no tablet, enquanto um campo da página tem foco.

**APIs:**

- `GET /api/ai/activity-log?limit=20` e limpeza do histórico em `/api/ai/activity-log`
- `GET /api/accounts?ativo=true`
- `POST /api/ai/generate`
- `POST /api/ai/image/generate`
- `POST /api/posts/upload-url`
- `POST /api/ai/schedule`
- `GET /api/logs/events/since/:cursor`
- `GET /api/ai/analytics-insights?days=...`

O limite gratuito de IA é controlado pelo backend. Os textos gerados são sugestões e devem poder ser revisados antes da publicação.

### 9.2 Smartlinks

Arquivo: `frontend/src/pages/smartlinks-page.jsx`.

**Para que serve:** criar uma página pública com vários destinos, substituindo a necessidade de trocar o link da bio a cada campanha.

**Interface:** uma linha por Smartlink (logo, título, `/go/slug`, total de links e de cliques), com "Copiar link", "Abrir" e o "…" (editar o endereço, excluir). Cada página mostra os 5 primeiros links com os cliques e "Ver todos os N links". "Novo Smartlink" abre numa folha; a primeira página é criada na própria tela.

**Funções:**

- Criar nome interno.
- Definir título, descrição e logo públicos.
- Escolher o endereço (`/go/slug`) e editá-lo depois.
- Cadastrar links no formato `texto | URL` (a caixa cresce com o conteúdo e conta as linhas).
- Listar páginas criadas.
- Mostrar quantidade de links e cliques.
- Copiar o link público e abrir a página pública.
- Excluir um Smartlink, com confirmação.

**APIs:**

- `GET /api/smartlinks`
- `POST /api/smartlinks`
- `PATCH /api/smartlinks/:id` (endereço)
- `DELETE /api/smartlinks/:id`
- `POST /api/posts/upload-url` (logo)
- Página pública em `/go/:slug`.

## 10. Equipe e administração

### 10.1 Espaços de trabalho

Arquivo: `frontend/src/pages/workspace-page.jsx`.

**Para que serve:** separar operações de clientes/marcas e controlar colaboração.

A tela continua atrás da flag `TEAM_APPROVAL_UI_ENABLED`. No celular, as abas viram um bloco segmentado; a lista lateral não acompanha a rolagem; e-mails longos quebram a linha. Se a gravação der certo e só a recarga da lista falhar, o sucesso continua valendo, com um aviso.

**Funções:**

- Criar espaços de trabalho.
- Selecionar um espaço.
- Ver papel do usuário no espaço.
- Adicionar colaboradores existentes por e-mail.
- Definir papel de editor, aprovador ou administrador.
- Listar membros.
- Selecionar uma publicação para revisão.
- Enviar uma publicação para aprovação.
- Aprovar ou rejeitar solicitações pendentes.
- Ver histórico de aprovações.
- Definir nome exibido e cor da marca.
- Mostrar estado vazio quando ainda não existe espaço.

**APIs:**

- `GET/POST /api/workspaces`
- `GET/POST /api/workspaces/:id/members`
- `GET/POST /api/workspaces/:id/approvals`
- `PATCH /api/workspaces/approvals/:id`
- `PATCH /api/workspaces/:id/branding`
- `GET /api/posts`

### 10.2 Administração

Arquivo: `frontend/src/pages/admin-page.jsx` (carregado sob demanda).

**Para que serve:** permitir que administradores gerenciem usuários, cobrança e operação da plataforma.

**Abas:** Usuários, Conciliação, Histórico e Dashboard (no celular, bloco segmentado 2×2; numa linha a partir de 520 px).

**Funções:**

- Identificar o administrador atual ("Sua conta").
- Listar e buscar usuários por e-mail.
- Mostrar e-mail, nome, papel, situação e quantidade de contas.
- Promover, rebaixar, ativar e desativar usuários, respeitando as restrições de segurança (o administrador não desativa a si próprio).
- Gerar e copiar o link de pagamento de um plano para um cliente buscado por e-mail.
- Conciliar pagamentos do período com usuários ("Vincular"); em telas estreitas, a tabela vira linhas empilhadas.
- Consultar o histórico de eventos.
- Ver o painel de indicadores da plataforma.
- Mostrar "Esta área é só para administradores" a quem não tem permissão (403).

**APIs:**

- `GET /api/me`
- `GET /api/admin/dashboard`
- `GET /api/admin/users` e `GET /api/admin/users/search?email=...`
- `POST /api/admin/users/:id/:ação`
- `GET /api/admin/users/:id/plan-link/:plano`
- `GET /api/admin/billing/reconciliation?days=...` e `POST /api/admin/billing/reconciliation/:sessionId/link`
- `GET /api/logs?limit=200`

Essa tela fica fora do `AppShell` e é acessada por `/admin.html`. Falhas de carga mostram erro com "Tentar de novo", nunca listas vazias.

## 11. Regras funcionais transversais

### Dados reais e isolamento

- Posts, contas, tokens, logs, comentários e analytics são filtrados pelo usuário autenticado no backend.
- O frontend deve renderizar estado vazio quando a API retornar listas vazias.
- Métricas só devem ser exibidas quando vierem de uma fonte real ou de histórico real salvo pelo produto.
- Falhas de uma rede não devem impedir que os dados das outras redes apareçam.

### Estados de carregamento e erro

Todas as páginas que consultam APIs possuem, conforme o módulo:

- Estado de carregamento.
- Mensagem de erro ou toast.
- Estado vazio específico para ausência de dados — nunca usado quando a carga falhou ou ainda não terminou (nesses casos, esqueleto ou erro com "Tentar de novo").
- Atualização após criar, editar, excluir ou alterar um recurso; depois de excluir um item, o foco vai para o item seguinte.
- Mensagens curtas em pt-BR; mensagens técnicas do servidor ("Erro interno do servidor", páginas de erro de proxy) viram o texto padrão.

### Persistência local

O `localStorage` é utilizado para preferências de experiência, não para criar dados de negócio. Exemplos:

- Tema.
- Sidebar recolhida.
- Filtros do Início, do Calendário, do Inbox e de Relatórios (rede e período).
- Autosave do Criador de Posts.
- Seleção de mídia.
- Dispensa do checklist de onboarding.

### Plataformas suportadas

O produto trabalha com Instagram, Facebook, YouTube e TikTok. Cada rede pode ter regras diferentes de mídia, texto, publicação, comentários e métricas; por isso o Criador de Posts, Analytics e Contas exibem configurações e capacidades específicas.

## 12. Relação entre páginas

| Origem | Destino | Motivo |
|---|---|---|
| Dashboard | Contas | Conectar ou corrigir uma rede. |
| Dashboard | Criador de Posts | Criar a primeira publicação ou revisar falha. |
| Dashboard | Calendário | Ver próximos agendamentos. |
| Dashboard | Analytics | Ver análise completa. |
| Dashboard | Atividades | Abrir detalhes de uma publicação. |
| Contas | Tokens | Corrigir token expirado ou inválido. |
| IA | Criador de Posts | Continuar uma ideia com edição avançada. |
| IA | Analytics | Consultar desempenho usado nos insights. |
| Biblioteca | Criador de Posts | Reutilizar uma mídia selecionada. |
| Biblioteca | Rascunhos | Salvar uma sugestão gerada. |
| Equipe | Criador de Posts | Criar conteúdo para enviar à aprovação. |
| Perfil | Contas/Tokens/Atividades | Atalhos de administração pessoal. |
| Segurança | Login | O 2FA altera o fluxo de autenticação seguinte. |

## 13. Referências de implementação

- Entrada e roteamento: `frontend/src/main.jsx`.
- Módulos lazy: `frontend/src/pages/module-page.jsx`.
- Shell autenticado: `frontend/src/components/layout/app-shell.jsx`.
- Cliente HTTP: `frontend/src/lib/api.js`.
- Hooks de analytics: `frontend/src/hooks/use-analytics.js`.
- Testes de componentes: `frontend/test/components/`.
- Rotas backend correspondentes: `src/routes/`, `src/http/routes/` e `src/http/controllers/`.
