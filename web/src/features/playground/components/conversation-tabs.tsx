import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function ConversationTabs() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const tokenId = new URLSearchParams(globalThis.location?.search || '').get(
    'token_id'
  )
  return (
    <nav
      aria-label={t('ACU Conversation')}
      className='flex shrink-0 flex-wrap gap-5 border-b px-4 py-3 text-sm'
    >
      {(
        [
          { to: '/playground', label: 'Text models' },
          { to: '/image-playground', label: 'Image generation' },
          { to: '/video-playground', label: 'Video generation' },
        ] as const
      ).map((item) => (
        <Link
          key={item.to}
          to={item.to}
          search={tokenId ? { token_id: tokenId } : {}}
          aria-current={
            pathname.replace(/\/$/, '') === item.to ? 'page' : undefined
          }
          className='text-muted-foreground aria-[current=page]:text-foreground aria-[current=page]:font-semibold'
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  )
}
