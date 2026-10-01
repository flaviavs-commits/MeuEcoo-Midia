import { apiFetch } from './api.js'

/*
 * Envio de um arquivo ao armazenamento (editor de post, Repetidor, Perfil, Smartlinks, Assistente):
 * o backend assina um endereço (POST /api/posts/upload-url) e o arquivo vai direto para ele (PUT).
 * Em modo privado o backend já devolve mediaUrl (proxy assinado); no modo público vale a URL final
 * que o armazenamento responde. A Biblioteca faz o mesmo par de chamadas por XHR, para mostrar o
 * progresso (hooks/use-media-upload.js).
 *
 * `label` é como o arquivo aparece nas mensagens ("a logo", "foto.png"); o padrão é o nome.
 */
export async function uploadToStorage(body, { filename, mimetype, label = filename }) {
  const signed = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename, mimetype }) })
  let response
  try {
    response = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimetype }, body })
  } catch {
    throw new Error(`Não foi possível enviar ${label}. Verifique a conexão e tente de novo.`)
  }
  if (!response.ok) throw new Error(`O armazenamento recusou ${label}. Tente de novo.`)
  const uploaded = await response.json().catch(() => null)
  const url = signed.mediaUrl || uploaded?.url
  if (!url) throw new Error(`O envio de ${label} terminou sem o endereço do arquivo. Tente de novo.`)
  return url
}
