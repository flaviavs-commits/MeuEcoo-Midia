export function LoadingState({ children = 'Carregando...' }) {
  return <div className="ds-loading" role="status" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />{children}</div>
}

// Esqueleto do cabeçalho e dos blocos de uma página enquanto o módulo carrega.
export function PageSkeleton({ label = 'Carregando módulo...' }) {
  return <div className="ds-page ds-pageskel" data-ds-root aria-busy="true">
    <p className="ds-sr-only" role="status">{label}</p>
    <span className="ds-skel ds-pageskel__eyebrow" />
    <span className="ds-skel ds-pageskel__title" />
    <span className="ds-skel ds-pageskel__lede" />
    <div className="ds-pageskel__blocks"><span className="ds-skel" /><span className="ds-skel" /><span className="ds-skel" /></div>
  </div>
}
