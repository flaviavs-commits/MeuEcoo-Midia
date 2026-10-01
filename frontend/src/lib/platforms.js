// As redes em que o app publica, na ordem usada em todas as telas (filtros, seletores, relatórios).
export const PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok']

export const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }

// Comentários e Inbox também recebem redes em que o app só lê; o nome delas vem daqui.
export const NETWORK_LABELS = { ...PLATFORM_LABELS, linkedin: 'LinkedIn', threads: 'Threads', reddit: 'Reddit', bluesky: 'Bluesky', x: 'X', twitter: 'X' }
