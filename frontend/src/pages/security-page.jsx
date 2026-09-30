import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon } from '../components/ui/icon.jsx'

const STEPS = ['Confirme sua senha', 'Escaneie o QR Code', 'Digite o código']

export function SecurityPage({ user, onUserChange }) {
  const [enabled, setEnabled] = useState(Boolean(user?.totpEnabled))
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const notify = useToast()

  // O usuário global pode chegar depois da tela (link direto) ou mudar em outra
  // página. Sem isso, a tela mostraria "desativado" para uma conta protegida e o
  // "Configurar" substituiria o segredo ativo no servidor.
  const userTotp = user?.totpEnabled
  useEffect(() => {
    if (typeof userTotp === 'boolean') setEnabled(userTotp)
  }, [userTotp])

  async function startSetup(event) {
    event?.preventDefault()
    if (!password) { setError('Informe sua senha atual para iniciar a configuração do 2FA.'); return }
    setBusy(true)
    setError('')
    try { setSetup(await apiFetch('/api/me/2fa/setup', { method: 'POST', body: JSON.stringify({ password }) })); setCode(''); setPassword(''); notify('QR Code gerado. Confirme para ativar o 2FA.') }
    catch (caught) { setError(caught.message); notify(caught.message, 'error') }
    finally { setBusy(false) }
  }

  async function enable(event) {
    event?.preventDefault()
    if (!/^\d{6}$/.test(code)) { setError('Digite o código de 6 dígitos do seu autenticador.'); return }
    setBusy(true)
    setError('')
    try { await apiFetch('/api/me/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }); setEnabled(true); setSetup(null); setCode(''); onUserChange?.({ totpEnabled: true }); notify('Autenticação em 2 fatores ativada.') }
    catch (caught) { setError(caught.message); notify(caught.message, 'error') }
    finally { setBusy(false) }
  }

  async function disable(event) {
    event?.preventDefault()
    if (!/^\d{6}$/.test(code)) { setError('Digite o código atual do autenticador para desativar.'); return }
    setBusy(true)
    setError('')
    try { await apiFetch('/api/me/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }); setEnabled(false); setSetup(null); setCode(''); onUserChange?.({ totpEnabled: false }); notify('Autenticação em 2 fatores desativada.') }
    catch (caught) { setError(caught.message); notify(caught.message, 'error') }
    finally { setBusy(false) }
  }

  function cancelSetup() {
    setSetup(null)
    setCode('')
    setError('')
  }

  const step = enabled ? 3 : setup ? 2 : 1
  const fieldError = error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" />{error}</p>
  const codeInput = (id, extra = {}) => <input
    id={id}
    className="ds-input sec-code"
    inputMode="numeric"
    autoComplete="one-time-code"
    maxLength="6"
    value={code}
    onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
    placeholder="000000"
    aria-invalid={error ? 'true' : undefined}
    disabled={busy}
    {...extra}
  />

  return <div className="ds-page sec" data-ds-root>
    <header className="ds-pagehead sec-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Minha conta</p>
        <h1 className="ds-pagehead__title">Segurança</h1>
        <p className="ds-pagehead__lede">Use um aplicativo autenticador para adicionar uma camada extra ao login.</p>
      </div>
    </header>

    <div className="sec-status" data-on={enabled || undefined}>
      <span className="sec-status__icon" aria-hidden="true"><Icon name={enabled ? 'checkCircle' : 'shield'} size={26} /></span>
      <div className="sec-status__text">
        <p className="sec-status__title">Autenticação em 2 fatores <span className="ds-status ds-status--soft" data-status={enabled ? 'ok' : 'warning'}>{enabled ? '2FA ativo' : '2FA desativado'}</span></p>
        <p className="ds-meta">{enabled ? 'O código do seu autenticador será solicitado sempre que você fizer login novamente.' : 'Além da senha, o login passa a pedir um código temporário do Google Authenticator, Authy ou outro app compatível.'}</p>
      </div>
    </div>

    {!enabled && <ol className="sec-steps" aria-label="Etapas da ativação">
      {STEPS.map((label, index) => <li key={label} data-state={index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'next'} aria-current={index + 1 === step ? 'step' : undefined}>
        <span className="sec-steps__num" aria-hidden="true">{index + 1 < step ? <Icon name="check" size={14} /> : index + 1}</span>{label}
      </li>)}
    </ol>}

    {!enabled && !setup && <form className="sec-well sec-intro" onSubmit={startSetup} noValidate>
      <div className="sec-well__head">
        <h2 className="sec-well__title">Ative a autenticação em 2 fatores</h2>
        <p className="ds-head__desc">Para começar, confirme que é você com a senha da conta.</p>
      </div>
      <div className="ds-field sec-field">
        <label className="ds-label" htmlFor="sec-password">Senha atual</label>
        <input id="sec-password" className="ds-input" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={error ? 'true' : undefined} disabled={busy} />
        {fieldError}
      </div>
      <div><button type="submit" className="ds-btn ds-btn--primary" disabled={busy}>{busy ? <><span className="ds-spinner" aria-hidden="true" />Gerando…</> : <><Icon name="shield" />Configurar 2FA</>}</button></div>
    </form>}

    {setup && !enabled && <div className="sec-setup">
      <section className="sec-well" aria-labelledby="sec-scan-title">
        <div className="sec-well__head">
          <h2 className="sec-well__title" id="sec-scan-title">Escaneie o QR Code</h2>
          <p className="ds-head__desc">Abra seu aplicativo autenticador e escaneie esta imagem. Se preferir, use a chave manual abaixo.</p>
        </div>
        <div className="sec-qr"><img src={setup.qrCodeDataUrl} alt="QR Code para configurar autenticação em 2 fatores" /></div>
        <details className="ds-disclosure sec-manual">
          <summary>Não consegue escanear? Use a chave manual<Icon name="chevronDown" size={16} className="ds-disclosure__chev" /></summary>
          <div className="ds-disclosure__body">
            <p className="ds-label" id="sec-secret-label">Chave manual</p>
            <code className="sec-secret" aria-labelledby="sec-secret-label">{setup.secret}</code>
          </div>
        </details>
      </section>
      <form className="sec-well" onSubmit={enable} noValidate aria-labelledby="sec-confirm-title">
        <div className="sec-well__head">
          <h2 className="sec-well__title" id="sec-confirm-title">Confirme o código</h2>
          <p className="ds-head__desc">Digite o código de 6 dígitos exibido no aplicativo.</p>
        </div>
        <div className="ds-field sec-field">
          <label className="ds-label" htmlFor="sec-code">Código do autenticador</label>
          {codeInput('sec-code', { autoFocus: true })}
          {fieldError}
        </div>
        <div className="sec-actions">
          <button type="submit" className="ds-btn ds-btn--primary" disabled={busy}>{busy ? <><span className="ds-spinner" aria-hidden="true" />Confirmando…</> : <><Icon name="lock" />Ativar proteção</>}</button>
          <button type="button" className="ds-btn ds-btn--quiet" onClick={cancelSetup} disabled={busy}>Cancelar</button>
        </div>
      </form>
    </div>}

    {enabled && <section className="sec-well sec-on" aria-labelledby="sec-on-title">
      <div className="sec-well__head">
        <h2 className="sec-well__title" id="sec-on-title">Sua conta está protegida</h2>
        <p className="ds-head__desc">Mantenha o aplicativo autenticador à mão: ele gera o código pedido a cada login.</p>
      </div>
      <details className="ds-disclosure sec-danger" open={Boolean(error) || undefined}>
        <summary><span className="sec-danger__sum"><Icon name="alertTriangle" size={18} />Desativar 2FA</span><Icon name="chevronDown" size={16} className="ds-disclosure__chev" /></summary>
        <form className="ds-disclosure__body sec-danger__body" onSubmit={disable} noValidate>
          <p className="ds-meta">Sem o 2FA, o login volta a pedir só a senha.</p>
          <div className="ds-field sec-field">
            <label className="ds-label" htmlFor="sec-disable-code">Para desativar, informe um código atual</label>
            {codeInput('sec-disable-code')}
            {fieldError}
          </div>
          <div><button type="submit" className="ds-btn ds-btn--danger" disabled={busy}>{busy ? <><span className="ds-spinner" aria-hidden="true" />Desativando…</> : 'Desativar 2FA'}</button></div>
        </form>
      </details>
    </section>}
  </div>
}
