import { Link } from 'react-router'
import { Avatar } from './SocialBits'
import { CategoryStamp } from '../studio/StudioBits'
import { AUDIENCES, when } from '../../lib/social'

/**
 * A published writing in a list: a typed page with its category stamp and the first
 * lines exactly as written (line breaks kept). Different from book and poem gifts on
 * purpose: this is somebody's own text, so it looks like the sheet it came from.
 */
export default function PublicationCard({ pub, showAuthor = true }) {
  return (
    <Link
      to={`/tertulia/escritos/${pub.id}`}
      className="manuscript typewriter-sheet letter-marfil group relative block rounded-[4px] px-6 pt-6 pb-7 transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="typed text-[11.5px] opacity-70">
          {when(pub.publishedAt)}
          {pub.updatedAt ? ' · actualizado' : ''}
        </span>
        {pub.category && <CategoryStamp category={pub.category} className="!text-[10.5px]" />}
      </div>
      <h3 className="typed text-[15px] leading-snug font-bold tracking-[0.08em] uppercase">{pub.title}</h3>
      {pub.intro && <p className="typed mt-2 text-[12.5px] italic opacity-75 line-clamp-2">{pub.intro}</p>}
      <p className="typed relative mt-3 max-h-36 overflow-hidden text-[13.5px] leading-[1.7] break-words whitespace-pre-line">
        {pub.preview}
        {pub.truncated && <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--sheet)] to-transparent" aria-hidden="true" />}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color-mix(in_oklab,var(--typed)_18%,transparent)] pt-3">
        {showAuthor && pub.author ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar person={pub.author} size={22} />
            <span className="typed truncate text-[12px]">{pub.author.name}</span>
          </span>
        ) : (
          <span className="typed text-[12px] opacity-70">{pub.withdrawn || pub.audience === 'private' ? AUDIENCES.private.label : AUDIENCES.friends.label}</span>
        )}
        <span className="typed shrink-0 text-[12px] underline-offset-4 group-hover:underline">{pub.truncated ? 'Leer completo' : 'Leer'}</span>
      </div>
    </Link>
  )
}
