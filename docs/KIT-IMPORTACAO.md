# Kit de importação — contrato

Um **kit** é um lote de posts prontos que vira ideias no **Baú de Ideias**,
para a pessoa revisar e levar ao Meu Post. Serve ao kit diário dos afiliados
e a qualquer pipeline que produza conteúdo aprovado (por exemplo, os agentes
de conteúdo da VS). **Nada é publicado nem agendado** pela importação.

- Pela tela: Baú de Ideias → **Importar kit** (colar o JSON ou escolher o arquivo).
- Pela API: `POST /api/drafts/import`, autenticado como o dono do Baú, com o kit no corpo.

## Formato

```json
{
  "title": "Kit de 03/10",
  "items": [
    {
      "title": "Carrossel da manhã",
      "platforms": ["instagram", "tiktok"],
      "text": "Texto usado nas redes sem texto próprio",
      "textByPlatform": { "instagram": "Legenda do Instagram", "tiktok": "Legenda curta" },
      "media": [{ "url": "https://exemplo.com/peca-1.jpg" }, "https://exemplo.com/peca-2.mp4"]
    }
  ]
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `title` (do kit) | não | até 200 caracteres; vira o título dos itens sem título ("Kit de 03/10 — item 1") |
| `items` | sim | de 1 a 20 itens |
| `items[].title` | não | até 200 caracteres |
| `items[].platforms` | não | `facebook`, `instagram`, `youtube`, `tiktok`; sem ele, as redes saem das chaves de `textByPlatform` |
| `items[].text` / `items[].textByPlatform` | um dos dois | até 10.000 caracteres por texto; `textByPlatform` só aceita as quatro redes |
| `items[].media` | não | até 10 por item e 30 no kit; cada uma é `{ "url" }` ou a URL direto, sempre `https://` |

## Mídias

Cada URL é baixada pelo servidor e copiada para o armazenamento do app, no mesmo formato de
um upload feito pela tela. O rascunho não depende do link original continuar no ar.

- Só HTTPS para endereço público: rede interna, IP privado e host de metadata da nuvem são recusados,
  e o IP validado é o mesmo usado na conexão (`src/utils/outboundUrl.js`).
- Redirecionamento é recusado: a URL precisa apontar direto para o arquivo.
- Tipos aceitos: os mesmos do upload (`ALLOWED_MEDIA_TYPES` em `src/infra/storage/blobStorage.js`),
  pelo `Content-Type` da resposta. Até 50 MB e 20 segundos por arquivo.
- Se uma mídia de um item falhar, **o item inteiro não entra** e as mídias dele que já tinham sido
  copiadas são apagadas: um rascunho sem a peça aprovada sairia incompleto sem ninguém perceber.

## Resposta

- Kit inválido como um todo (não é objeto, sem `items`, itens ou mídias demais): `400 { "erro": "…" }`, e nada é criado.
- Kit válido: `200` com o resultado de cada item. Os itens são independentes: os que entraram já
  estão no Baú, mesmo que outros falhem.

```json
{
  "total": 2, "criados": 1, "falharam": 1,
  "itens": [
    { "index": 0, "ok": true, "draftId": 812, "title": "Kit de 03/10 — item 1" },
    { "index": 1, "ok": false, "erro": "Tipo de mídia não permitido: text/html" }
  ]
}
```

Importar o mesmo kit de novo cria rascunhos de novo: para reenviar só o que falhou, mande um kit
com esses itens.

## Onde está no código

- Regras do kit: `src/domain/drafts/kit.js`
- Caso de uso: `src/use-cases/drafts/importarKit.js`
- Download seguro da mídia: `src/infra/storage/importarMidiaPorUrl.js`
- Rota: `src/routes/drafts.js` (`POST /api/drafts/import`)
- Tela: `frontend/src/components/drafts/kit-import-dialog.jsx`, aberto pelo Baú (`drafts-page.jsx`)
