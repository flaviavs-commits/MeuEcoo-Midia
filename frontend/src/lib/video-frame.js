// Espera o navegador decodificar um frame de verdade antes de desenhá-lo num canvas: é o que
// impede a prévia (PreviewVideo) e a análise de vídeo de capturarem um quadro borrado ou incompleto.
// Testada em frontend/test/components/preview-video-frame.test.jsx.
export function waitForDecodedVideoFrame(video) {
  return new Promise((resolve, reject) => {
    let settled = false
    let frameRequested = false
    let frameTimeout
    const cleanup = () => {
      clearTimeout(frameTimeout)
      video.removeEventListener('loadeddata', requestFrame)
      video.removeEventListener('canplay', requestFrame)
      video.removeEventListener('error', fail)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error = new Error('O navegador não conseguiu decodificar um frame do vídeo.')) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const waitOnePaint = () => {
      const paint = () => finish()
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(paint))
      } else {
        setTimeout(paint, 0)
      }
    }
    const requestFrame = () => {
      if (settled || frameRequested || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
      frameRequested = true
      if (typeof video.requestVideoFrameCallback === 'function') {
        try {
          video.requestVideoFrameCallback(() => finish())
          // Fallback para navegadores que expõem a API, mas não disparam o
          // callback quando o elemento está pausado após um seek.
          frameTimeout = setTimeout(waitOnePaint, 1000)
          return
        } catch {
          // Alguns navegadores expõem a API, mas podem recusá-la durante um seek.
        }
      }
      waitOnePaint()
    }
    video.addEventListener('loadeddata', requestFrame)
    video.addEventListener('canplay', requestFrame)
    video.addEventListener('error', fail)
    frameTimeout = setTimeout(() => fail(), 8_000)
    requestFrame()
  })
}
