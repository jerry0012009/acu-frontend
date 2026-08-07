import { BrandWordmark } from '@/components/layout/components/brand-wordmark'
import { BRAND_DOCUMENT_TITLE } from '@/lib/brand'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='relative grid h-svh max-w-none'>
      <a
        href='/index'
        aria-label={BRAND_DOCUMENT_TITLE}
        className='absolute top-4 left-4 z-10 flex items-center transition-opacity hover:opacity-80 sm:top-8 sm:left-8'
      >
        <BrandWordmark className='text-[30px] sm:text-4xl' />
      </a>
      <div className='container flex items-center pt-16 sm:pt-0'>
        <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-8'>
          {children}
        </div>
      </div>
    </div>
  )
}
