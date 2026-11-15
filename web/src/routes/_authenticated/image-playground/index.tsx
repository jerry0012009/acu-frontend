import { createFileRoute } from '@tanstack/react-router'

import { Main } from '@/components/layout'
import { MediaWorkbench } from '@/features/media-workbench'

export const Route = createFileRoute('/_authenticated/image-playground/')({
  component: () => (
    <Main className='p-0'>
      <MediaWorkbench kind='image' />
    </Main>
  ),
})
