# Backup e restauração do banco de produção

Banco: serviço `meuecoo-midia-postgres` no Railway (projeto `2f4d713a-…`), volume `postgres-volume`
(volume instance `59bf5548-85cf-42f7-a645-617ac5b790c7`), Postgres 18.

## O que existe

| Camada | Como | Retenção | Desde |
|---|---|---|---|
| Backup diário do volume (Railway) | agendamento `DAILY`, `7 0 * * *` (UTC) | 6 dias | 03/10/2026 |
| Backup semanal do volume (Railway) | agendamento `WEEKLY`, `29 2 * * 6` (sábado, UTC) | 27 dias | 03/10/2026 |
| Backup manual | painel ou `volumeInstanceBackupCreate`, antes de mudança arriscada | definida pelo Railway (o de 27/08 venceu em 30 dias; o de 03/10 saiu sem data de expiração) | sob demanda |

Até 03/10/2026, o banco **não tinha agendamento nenhum**. O único backup era um manual de 27/08,
já vencido em 26/09.

Para conferir o agendamento, use o painel do Railway (serviço do Postgres, volume, Backups) ou a
GraphQL `volumeInstanceBackupScheduleList(volumeInstanceId)`. Os backups existentes saem em
`volumeInstanceBackupList`.

## Restaurar

**O backup do volume restaura por cima do próprio volume.** Restaurar é sobrescrever produção
inteira com o estado do backup. Faça isso só em desastre e com o app parado. Antes, crie um backup
manual do estado atual, para poder voltar. Pelo painel: volume, Backups, Restore.

Para recuperar **parte** dos dados (uma tabela apagada sem querer, por exemplo) sem mexer no resto,
use um dump lógico restaurado num banco separado do mesmo servidor e copie dali só o que precisa:

```sh
# dentro do container do Postgres (railway ssh -s meuecoo-midia-postgres), pelo socket local
B=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
$B/pg_dump    -h /var/run/postgresql -U postgres -d railway -Fc -f /tmp/backup.dump
$B/psql       -h /var/run/postgresql -U postgres -d postgres -c 'CREATE DATABASE restauracao'
$B/pg_restore -h /var/run/postgresql -U postgres -d restauracao --exit-on-error /tmp/backup.dump
# ... conferir ou copiar o que precisar ...
$B/psql       -h /var/run/postgresql -U postgres -d postgres -c 'DROP DATABASE restauracao'
rm -f /tmp/backup.dump
```

## Teste de restauração (03/10/2026)

O procedimento acima foi feito num banco temporário, `restauracao_teste_20261003`, sem tocar no
banco `railway`:

- dump de 580 KB em menos de 1 s, com o banco em 26 MB;
- restauração em 88 s, sem erro (`--exit-on-error`);
- **50 de 50 tabelas com contagens idênticas** às de produção. Entre elas: `users` 27, `credentials`
  18, `subscriptions` 6, `billing_plan_changes` 4, `contas` 24, `tokens` 22 e `posts` 328;
- depois do teste, o banco temporário e o dump foram apagados, e o servidor ficou só com `postgres`
  e `railway`.

O teste não exercita a restauração do backup **de volume** do Railway. Pela API, ela só existe por
cima do volume de produção, e por isso não foi executada.

Os dados restaurados contêm tokens das redes cifrados com `TOKEN_ENCRYPTION_KEY`. Um backup só é
útil junto com essa chave, que fica nas variáveis da API no Railway.
