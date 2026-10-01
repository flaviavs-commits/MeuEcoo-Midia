import {
  MEDIA_LIBRARY_SELECTION_KEY, SCHEDULER_AUTOSAVE_KEY, composerDraftFromPost, mediaItemsOf, mediaSelectionOf, openInComposer, readMediaSelection,
} from '../../src/lib/composer-handoff.js'

describe('passagem para o Meu Post', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('leva todos os campos de uma publicação com falha (Reels, categoria do YouTube, opções do TikTok)', () => {
    const draft = composerDraftFromPost({
      id: 9, platforms: ['facebook', 'youtube', 'tiktok'], text: 'Base',
      textByPlatform: JSON.stringify({ facebook: 'No Face', youtube: 'No YT' }),
      facebookFormat: 'reel', youtubeCategoryId: 22, youtubeMadeForKids: false,
      tiktokPrivacyLevel: 'SELF_ONLY', tiktokDisableComment: true, tiktokDisableStitch: true,
    }, { publishNow: true, sourceFailureId: 9 })

    expect(draft).toMatchObject({
      selected: ['facebook', 'youtube', 'tiktok'], textByPlatform: { facebook: 'No Face', youtube: 'No YT' },
      facebookFormat: 'reel', youtubeCategoryId: '22', youtubeMadeForKids: 'false',
      tiktokPrivacyLevel: 'SELF_ONLY', tiktokDisableComment: true, tiktokDisableDuet: false, tiktokDisableStitch: true,
      publishNow: true, sourceFailureId: 9,
    })
  })

  it('aceita os campos de uma ideia do Baú (snake_case) e repete o texto em cada rede quando não há texto por rede', () => {
    const draft = composerDraftFromPost({ platforms: ['instagram', 'facebook'], text: 'Ideia', ig_format: 'reel', youtube_title: 'T' })
    expect(draft).toMatchObject({ textByPlatform: { instagram: 'Ideia', facebook: 'Ideia' }, igFormat: 'reel', youtubeTitle: 'T', publishNow: false })
  })

  it('lê as mídias na ordem (carrossel) e, sem elas, a mídia única', () => {
    expect(mediaItemsOf({ mediaItems: JSON.stringify([{ path: '/a.png', type: 'image/png' }, { url: '/b.png' }, { type: 'image' }]) }).map(item => item.path || item.url))
      .toEqual(['/a.png', '/b.png'])
    expect(mediaItemsOf({ media_path: '/v.mp4', media_type: 'video/mp4' })).toEqual([{ path: '/v.mp4', type: 'video/mp4' }])
    expect(mediaSelectionOf({ path: '/a.png', type: 'image/png' })).toEqual({ url: '/a.png', name: 'Mídia da publicação', mimeType: 'image/png' })
  })

  it('grava o rascunho e as mídias; a leitura aceita a lista e o formato antigo (um objeto)', () => {
    expect(openInComposer({ draft: { selected: ['instagram'] }, media: [{ url: '/a.png' }, { url: '/b.png' }] })).toBe(true)
    expect(JSON.parse(localStorage.getItem(SCHEDULER_AUTOSAVE_KEY))).toEqual({ selected: ['instagram'] })
    expect(readMediaSelection().map(item => item.url)).toEqual(['/a.png', '/b.png'])

    sessionStorage.setItem(MEDIA_LIBRARY_SELECTION_KEY, JSON.stringify({ id: 3, url: '/c.png', name: 'c.png' }))
    expect(readMediaSelection()).toEqual([{ id: 3, url: '/c.png', name: 'c.png' }])
  })
})
