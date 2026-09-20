# Timeline de cinco etapas

A seção de recursos da landing usa `TimelineStory`. A narrativa anterior de seis recursos em `product-story.md` pertence ao componente legado `ProductStory`.

## Composição

Os marcadores 1–5 usam a fonte sans da landing e alternam entre 40% e 60% da largura da cena. Cada segmento SVG liga os centros exatos de dois marcadores, com hastes curtas, diagonais e curvas nas mudanças de direção. O trecho percorrido recebe o dourado da marca; não há pulsação infinita nem brilho difuso.

## Movimento

`frontend/src/components/marketing/timeline-motion.js` define a sequência compartilhada pelas cinco etapas: aproximação, título letra a letra, descrição, leitura e recuo. A câmera aproxima até cerca de 1,73× e recua para 1,04× nas travessias. A posição de scroll controla câmera, letras, foco e preenchimento da linha; rolar para trás reproduz os mesmos quadros em ordem inversa.

O controlador em `timeline-story.jsx` usa um único `requestAnimationFrame`, eventos passivos e medidas coletadas em resize/carregamento das fontes. React só atualiza quando a etapa ativa ou seu estado de foco muda. As palavras preservam suas quebras naturais; as letras ocupam o espaço completo desde o início, evitando deslocamentos durante a revelação.

Os estilos ficam em `frontend/src/styles/timeline-story.css`. O painel ilustrativo de resultados aparece ao lado da última etapa em desktops largos e abaixo da sequência no layout empilhado.

## Responsividade e acessibilidade

Até 860px de largura ou 560px de altura, a sequência fica empilhada, com zigue-zague menor e entrada escalonada das letras via IntersectionObserver. Sem suporte ao observador, o texto aparece completo. `prefers-reduced-motion` desliga câmera e revelação, inclusive quando a preferência muda durante o uso.

Os títulos mantêm seus nomes acessíveis completos; as descrições possuem uma versão contínua para leitores de tela. Letras decorativas e SVG ficam fora da árvore acessível. O link “Ir para planos” permanece disponível durante o percurso.

## Validação — 18/09/2026

Oito testes direcionados cobrem a landing, os cinco momentos de leitura, recuos, continuidade, geometria do caminho, rolagem nos dois sentidos, troca para movimento reduzido e limpeza dos observadores/listeners. Build Vite validado em `tmp/timeline-zigzag-build`, sem atualizar os bundles versionados de `public/react`.

A inspeção visual nesta sessão ficou indisponível: o navegador conectado não expôs nenhuma aba, e o helper de captura do Windows retornou erro de conexão com o pipe nativo. Responsividade visual e aparência final não foram verificadas por screenshot.
