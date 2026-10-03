// Isolamento entre usuários e papéis, contra o Postgres real: autenticação de verdade (token de
// sessão assinado, requireAuth lendo o usuário no banco) e o SQL das rotas sem mock. A matriz que
// estes testes provam está em docs/MATRIZ-AUTORIZACAO.md. Roda como em produção depois da fase 2:
// app como meuecoo_app, contexto do usuário no pool e RLS em contas, tokens, posts e logs.
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'segredo-de-teste-auth-token-32-caracteres'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste-session-32-caracteres!!'
process.env.ALLOWED_EMAIL_DOMAINS = 'teste.local'

const request = require('supertest')
const { urlDoBanco, prepararBanco, limparBanco } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('isolamento entre usuários e papéis (Postgres real)', () => {
  let banco, app, sql, u, ws
  const como = (usuario) => {
    const { gerarTokenSessao } = require('../../src/utils/authToken')
    const token = gerarTokenSessao(usuario.id)
    const auth = req => req.set('Authorization', `Bearer ${token}`)
    return {
      get: url => auth(request(app).get(url)),
      post: (url, body) => auth(request(app).post(url)).send(body),
      patch: (url, body) => auth(request(app).patch(url)).send(body),
      delete: url => auth(request(app).delete(url)),
    }
  }
  const umValor = async (texto, params) => (await sql(texto, params)).rows[0]

  beforeAll(async () => {
    banco = await prepararBanco({ rls: true })
    sql = (texto, params) => banco.pool.query(texto, params)
    app = require('../../src/server')

    const criarUsuario = async (nome, role = 'user') => umValor(
      "INSERT INTO users (email, full_name, role, plan, plan_active) VALUES ($1, $2, $3, 'pro', TRUE) RETURNING id, email",
      [`${nome}@teste.local`, nome, role]
    )
    u = {
      dono: await criarUsuario('dono'),
      estranho: await criarUsuario('estranho'),
      adminEspaco: await criarUsuario('admin-espaco'),
      editor: await criarUsuario('editor'),
      revisor: await criarUsuario('revisor'),
      adminSistema: await criarUsuario('admin-sistema', 'admin'),
    }

    ws = await umValor("INSERT INTO workspaces (owner_id, name, slug) VALUES ($1, 'Espaço do dono', 'espaco-do-dono') RETURNING id", [u.dono.id])
    for (const [usuario, papel] of [[u.dono, 'owner'], [u.adminEspaco, 'admin'], [u.editor, 'editor'], [u.revisor, 'reviewer']]) {
      await sql('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [ws.id, usuario.id, papel])
    }
  })

  afterAll(async () => { await limparBanco(banco) })

  describe('recursos de um usuário não aparecem nem mudam para outro', () => {
    let link, fila, relatorio, midia, rascunho, chave

    beforeAll(async () => {
      link = await umValor("INSERT INTO smartlinks (user_id, name, slug) VALUES ($1, 'Link do dono', 'link-do-dono') RETURNING id", [u.dono.id])
      fila = await umValor("INSERT INTO content_queues (user_id, name) VALUES ($1, 'Fila do dono') RETURNING id", [u.dono.id])
      relatorio = await umValor("INSERT INTO report_schedules (user_id, name) VALUES ($1, 'Relatório do dono') RETURNING id", [u.dono.id])
      midia = await umValor("INSERT INTO media_assets (user_id, name, url) VALUES ($1, 'foto.jpg', 'https://exemplo.com/foto.jpg') RETURNING id", [u.dono.id])
      rascunho = await umValor("INSERT INTO drafts (user_id, text) VALUES ($1, 'Rascunho do dono') RETURNING id", [u.dono.id])
      chave = await umValor("INSERT INTO api_keys (user_id, name, prefix, key_hash) VALUES ($1, 'Chave do dono', 'pfx', 'hash') RETURNING id", [u.dono.id])
    })

    const recursos = () => [
      { nome: 'smartlinks', url: '/api/smartlinks', chave: 'smartlinks', id: link.id },
      { nome: 'filas', url: '/api/content-queues', chave: 'queues', id: fila.id },
      { nome: 'relatórios agendados', url: '/api/report-schedules', chave: 'schedules', id: relatorio.id },
      { nome: 'mídias', url: '/api/media-assets', chave: 'assets', id: midia.id },
      { nome: 'rascunhos', url: '/api/drafts', chave: 'drafts', id: rascunho.id },
      { nome: 'chaves de API', url: '/api/api-keys', chave: 'keys', id: chave.id },
    ]

    test.each(['estranho', 'adminSistema'])('a listagem de %s não traz nada do dono', async (quem) => {
      for (const recurso of recursos()) {
        const res = await como(u[quem]).get(recurso.url)
        expect({ recurso: recurso.nome, status: res.status }).toEqual({ recurso: recurso.nome, status: 200 })
        const ids = Object.values(res.body).find(Array.isArray)?.map(item => item.id) || []
        expect({ recurso: recurso.nome, ids }).toEqual({ recurso: recurso.nome, ids: [] })
      }
    })

    test('o dono vê os próprios recursos (a listagem acima não está vazia por outro motivo)', async () => {
      for (const recurso of recursos()) {
        const res = await como(u.dono).get(recurso.url)
        const ids = Object.values(res.body).find(Array.isArray)?.map(item => item.id) || []
        expect({ recurso: recurso.nome, contem: ids.includes(recurso.id) }).toEqual({ recurso: recurso.nome, contem: true })
      }
    })

    test('um estranho não apaga nem altera recurso do dono', async () => {
      const outro = como(u.estranho)
      await outro.delete(`/api/smartlinks/${link.id}`)
      await outro.delete(`/api/content-queues/${fila.id}`)
      await outro.delete(`/api/report-schedules/${relatorio.id}`)
      await outro.delete(`/api/media-assets/${midia.id}`)
      await outro.delete(`/api/drafts/${rascunho.id}`)
      await outro.delete(`/api/api-keys/${chave.id}`)
      expect((await outro.patch(`/api/smartlinks/${link.id}`, { slug: 'roubado' })).status).toBe(404)
      expect((await outro.patch(`/api/content-queues/${fila.id}`, { active: false })).status).toBe(404)
      expect((await outro.patch(`/api/report-schedules/${relatorio.id}`, { active: false })).status).toBe(404)
      expect((await outro.patch(`/api/media-assets/${midia.id}`, { name: 'roubado' })).status).toBe(404)

      const sobreviventes = await umValor(`SELECT
        (SELECT slug FROM smartlinks WHERE id=$1) AS link,
        (SELECT active FROM content_queues WHERE id=$2) AS fila,
        (SELECT active FROM report_schedules WHERE id=$3) AS relatorio,
        (SELECT name FROM media_assets WHERE id=$4) AS midia,
        (SELECT COUNT(*)::int FROM drafts WHERE id=$5) AS rascunho,
        (SELECT revoked_at FROM api_keys WHERE id=$6) AS chave_revogada`, [link.id, fila.id, relatorio.id, midia.id, rascunho.id, chave.id])
      expect(sobreviventes).toEqual({ link: 'link-do-dono', fila: true, relatorio: true, midia: 'foto.jpg', rascunho: 1, chave_revogada: null })
    })
  })

  describe('workspaces: cada papel só faz o que pode', () => {
    test('quem não é membro não vê nem mexe no espaço, nem sendo admin do sistema', async () => {
      for (const quem of [u.estranho, u.adminSistema]) {
        expect((await como(quem).get(`/api/workspaces/${ws.id}/members`)).status).toBe(403)
        expect((await como(quem).get(`/api/workspaces/${ws.id}/approvals`)).status).toBe(403)
        expect((await como(quem).patch(`/api/workspaces/${ws.id}/branding`, { name: 'Invadido' })).status).toBe(403)
        expect((await como(quem).post(`/api/workspaces/${ws.id}/members`, { email: quem.email, role: 'admin' })).status).toBe(403)
        const lista = await como(quem).get('/api/workspaces')
        expect(lista.body.workspaces.map(w => w.id)).not.toContain(ws.id)
      }
      expect(await umValor('SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id=$1', [ws.id])).toEqual({ n: 4 })
    })

    test('editor e revisor veem os membros, mas não editam a marca nem convidam', async () => {
      for (const quem of [u.editor, u.revisor]) {
        expect((await como(quem).get(`/api/workspaces/${ws.id}/members`)).status).toBe(200)
        expect((await como(quem).patch(`/api/workspaces/${ws.id}/branding`, { name: 'Outro nome' })).status).toBe(403)
        expect((await como(quem).post(`/api/workspaces/${ws.id}/members`, { email: u.estranho.email })).status).toBe(403)
      }
    })

    test('admin do espaço convida, mas não rebaixa o dono', async () => {
      expect((await como(u.adminEspaco).post(`/api/workspaces/${ws.id}/members`, { email: u.dono.email, role: 'editor' })).status).toBe(409)
      expect(await umValor('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [ws.id, u.dono.id])).toEqual({ role: 'owner' })
    })

    test('o dono também não se rebaixa pelo convite (o espaço ficaria sem dono)', async () => {
      expect((await como(u.dono).post(`/api/workspaces/${ws.id}/members`, { email: u.dono.email, role: 'admin' })).status).toBe(409)
      expect(await umValor('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [ws.id, u.dono.id])).toEqual({ role: 'owner' })
    })

    describe('aprovação de posts', () => {
      let postEditor, aprovacao

      beforeAll(async () => {
        postEditor = await umValor("INSERT INTO posts (user_id, text, platforms, scheduled_at, status) VALUES ($1, 'Post do editor', ARRAY['instagram'], NOW() + INTERVAL '1 day', 'scheduled') RETURNING id", [u.editor.id])
      })

      test('ninguém pede aprovação de post alheio', async () => {
        expect((await como(u.revisor).post(`/api/workspaces/${ws.id}/approvals`, { postId: postEditor.id })).status).toBe(404)
        expect((await como(u.estranho).post(`/api/workspaces/${ws.id}/approvals`, { postId: postEditor.id })).status).toBe(400)
      })

      test('o editor pede aprovação do próprio post', async () => {
        const res = await como(u.editor).post(`/api/workspaces/${ws.id}/approvals`, { postId: postEditor.id })
        expect(res.status).toBe(201)
        aprovacao = res.body.approval
      })

      test('quem pediu não aprova o próprio conteúdo, e editor/estranho não avaliam', async () => {
        expect((await como(u.editor).patch(`/api/workspaces/approvals/${aprovacao.id}`, { status: 'approved' })).status).toBe(403)
        expect((await como(u.estranho).patch(`/api/workspaces/approvals/${aprovacao.id}`, { status: 'rejected' })).status).toBe(403)
        expect((await como(u.adminSistema).patch(`/api/workspaces/approvals/${aprovacao.id}`, { status: 'approved' })).status).toBe(403)
        expect(await umValor('SELECT status FROM approval_requests WHERE id=$1', [aprovacao.id])).toEqual({ status: 'pending' })
      })

      test('o revisor aprova, e o post volta a ficar agendado', async () => {
        expect((await como(u.revisor).patch(`/api/workspaces/approvals/${aprovacao.id}`, { status: 'approved' })).status).toBe(204)
        expect(await umValor('SELECT status FROM posts WHERE id=$1', [postEditor.id])).toEqual({ status: 'scheduled' })
      })
    })
  })

  describe('posts, contas e tokens das redes', () => {
    let conta, token, post

    beforeAll(async () => {
      conta = await umValor("INSERT INTO contas (user_id, platform, handle, tipo) VALUES ($1, 'instagram', 'perfil_do_dono', 'NICHO') RETURNING id", [u.dono.id])
      token = await umValor("INSERT INTO tokens (conta_id, platform, access_token, expires_at) VALUES ($1, 'instagram', 'token-cifrado-de-teste', NOW() + INTERVAL '30 days') RETURNING id", [conta.id])
      post = await umValor("INSERT INTO posts (user_id, text, platforms, scheduled_at, status) VALUES ($1, 'Post do dono', ARRAY['instagram'], NOW() + INTERVAL '2 days', 'scheduled') RETURNING id", [u.dono.id])
      await sql('INSERT INTO post_accounts (post_id, account_id) VALUES ($1, $2)', [post.id, conta.id])
    })

    const idsDaLista = res => Object.values(res.body).find(Array.isArray)?.map(item => item.id) || []

    test.each(['estranho', 'adminSistema'])('as listagens de %s não trazem post, conta nem token do dono', async (quem) => {
      const posts = await como(u[quem]).get('/api/posts')
      const contas = await como(u[quem]).get('/api/accounts')
      const tokens = await como(u[quem]).get('/api/tokens')
      expect([posts.status, contas.status, tokens.status]).toEqual([200, 200, 200])
      expect(idsDaLista(posts)).not.toContain(post.id)
      expect(idsDaLista(contas)).not.toContain(conta.id)
      expect(idsDaLista(tokens)).not.toContain(token.id)
    })

    test('o dono vê o próprio post e a própria conta', async () => {
      expect(idsDaLista(await como(u.dono).get('/api/posts'))).toContain(post.id)
      expect(idsDaLista(await como(u.dono).get('/api/accounts'))).toContain(conta.id)
    })

    test('um estranho não lê, reagenda, repete nem apaga o post do dono', async () => {
      const outro = como(u.estranho)
      const amanha = new Date(Date.now() + 86400000).toISOString()
      expect((await outro.patch(`/api/posts/${post.id}`, { scheduledAt: amanha })).status).toBe(404)
      expect((await outro.post(`/api/posts/${post.id}/repeat`, { scheduledAt: amanha })).status).toBe(404)
      expect((await outro.get(`/api/posts/${post.id}/metrics-history`)).status).toBe(404)
      expect((await outro.get(`/api/posts/${post.id}/comments`)).status).toBe(404)
      expect((await outro.delete(`/api/posts/${post.id}`)).status).toBe(404)
      expect(await umValor('SELECT status, (SELECT COUNT(*)::int FROM posts WHERE user_id=$2) AS copias FROM posts WHERE id=$1', [post.id, u.estranho.id]))
        .toEqual({ status: 'scheduled', copias: 0 })
    })

    test('um estranho não lê, desconecta nem pendura token na conta do dono', async () => {
      const outro = como(u.estranho)
      expect((await outro.get(`/api/accounts/${conta.id}`)).status).toBe(404)
      expect((await outro.delete(`/api/accounts/${conta.id}`)).status).toBe(404)
      expect((await outro.delete(`/api/tokens/${token.id}`)).status).toBe(404)
      expect((await outro.post(`/api/tokens/renew/${token.id}`)).status).toBe(404)
      expect((await outro.post('/api/tokens', { accountId: conta.id, platform: 'instagram', accessToken: 'intruso' })).status).toBe(404)
      expect(await umValor('SELECT c.ativo, t.access_token, (SELECT COUNT(*)::int FROM tokens WHERE conta_id=$1) AS tokens FROM contas c JOIN tokens t ON t.conta_id=c.id WHERE c.id=$1', [conta.id]))
        .toEqual({ ativo: true, access_token: 'token-cifrado-de-teste', tokens: 1 })
    })
  })

  describe('painel administrativo', () => {
    test('quem não é admin do sistema não entra', async () => {
      for (const rota of ['/api/admin/users', '/api/admin/dashboard', '/api/admin/billing/reconciliation']) {
        expect({ rota, status: (await como(u.dono).get(rota)).status }).toEqual({ rota, status: 403 })
      }
    })

    test('o admin do sistema vê só a própria conta e não muda papel nem situação de outra', async () => {
      const admin = como(u.adminSistema)
      const lista = await admin.get('/api/admin/users')
      expect(lista.status).toBe(200)
      expect(lista.body.data.map(usuario => usuario.id)).toEqual([u.adminSistema.id])
      expect((await admin.post(`/api/admin/users/${u.dono.id}/role`, { role: 'admin' })).status).toBe(403)
      expect((await admin.post(`/api/admin/users/${u.dono.id}/ativo`, { ativo: false })).status).toBe(403)
      expect(await umValor('SELECT role, ativo FROM users WHERE id=$1', [u.dono.id])).toEqual({ role: 'user', ativo: true })
    })

    test('o papel legado super_admin vira admin no startup e não sobra com escopo ampliado', async () => {
      const legado = await umValor("INSERT INTO users (email, role, plan, plan_active) VALUES ('legado@teste.local', 'super_admin', 'pro', TRUE) RETURNING id")
      const { runMigrations } = require('../../src/db/runtimeMigrations')
      await runMigrations({ pool: banco.pool })
      expect(await umValor('SELECT role FROM users WHERE id=$1', [legado.id])).toEqual({ role: 'admin' })
    })
  })
})
