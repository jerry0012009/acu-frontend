import { Link } from '@tanstack/react-router'

import { BRAND_DOCUMENT_TITLE, BRAND_WORDMARK_URL } from '@/lib/brand'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='relative grid h-svh max-w-none'>
      <Link
        to='/'
        aria-label={BRAND_DOCUMENT_TITLE}
        className='absolute top-4 left-4 z-10 flex items-center transition-opacity hover:opacity-80 sm:top-8 sm:left-8'
      >
        <div className='relative h-9 w-[5.75rem] sm:h-11 sm:w-[7rem]'>
          <img
            src={BRAND_WORDMARK_URL}
            alt={BRAND_DOCUMENT_TITLE}
            className='h-full w-auto max-w-full object-contain'
          />
        </div>
      </Link>
      <div className='container flex items-center pt-16 sm:pt-0'>
        <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-8'>
          {children}
        </div>
      </div>
    </div>
  )
}
