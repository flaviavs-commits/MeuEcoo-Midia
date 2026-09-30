import { Icon } from '../ui/icon.jsx'
import { OverflowMenu } from '../ui/overflow-menu.jsx'
import { formatName, formatSize, isVideo, shortText } from './media-format.js'

/*
 * One asset in the library grid: the media leads (a button that opens the preview), then the name,
 * one short line of facts and at most two tags. "Usar no post" shows over the media on hover or focus
 * (pointer screens); every action is also in the "…" menu, which is what touch screens use.
 */
export function MediaCard({ asset, showFolder = false, menuItems, onOpen, onUse }) {
  const video = isVideo(asset)
  const tags = Array.isArray(asset.tags) ? asset.tags : []
  const facts = [showFolder && asset.folder, formatName(asset), formatSize(asset.sizeBytes)].filter(Boolean).join(' · ')
  return <li className="lib-asset">
    <div className="lib-asset__media">
      <button type="button" className="lib-asset__open" onClick={() => onOpen(asset)} aria-label={`Visualizar ${asset.name}`}>
        {video
          ? <><video src={asset.url} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" /><span className="lib-asset__play" aria-hidden="true"><Icon name="play" size={16} /></span></>
          : <img src={asset.url} alt="" loading="lazy" decoding="async" />}
      </button>
      <button type="button" className="ds-btn ds-btn--sm lib-asset__use" onClick={() => onUse(asset)} aria-label={`Usar ${asset.name} no Meu Post`}>
        <Icon name="compose" size={16} />Usar no post
      </button>
    </div>
    <div className="lib-asset__body">
      <div className="lib-asset__text">
        <p className="lib-asset__name" title={asset.name}>{asset.name}</p>
        {facts && <p className="ds-meta lib-asset__info" title={facts}>{facts}</p>}
        {tags.length > 0 && <p className="lib-asset__tags" title={tags.map(tag => `#${tag}`).join(' ')}>
          {tags.slice(0, 2).map(tag => <span key={tag}>#{tag}</span>)}
          {tags.length > 2 && <span className="lib-asset__more">+{tags.length - 2}</span>}
        </p>}
      </div>
      <OverflowMenu label={`Mais ações para “${shortText(asset.name)}”`} sheetTitle={shortText(asset.name, 40)} items={menuItems} />
    </div>
  </li>
}
