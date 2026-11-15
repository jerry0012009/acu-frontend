import { createFileRoute } from '@tanstack/react-router'

import { Main } from '@/components/layout'
import { MediaWorkbench } from '@/features/media-workbench'

export const Route = createFileRoute('/_authenticated/video-playground/')({
  component: () => (
    <Main className='p-0'>
      <MediaWorkbench kind='video' />
    </Main>
  ),
})
