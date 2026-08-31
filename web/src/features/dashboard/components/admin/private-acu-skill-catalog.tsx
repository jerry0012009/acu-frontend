import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PrivateACUMemorySkill } from '../../private-acu-admin-api'

export function PrivateACUSkillCatalog(props: {
  skills: PrivateACUMemorySkill[]
}) {
  const { t } = useTranslation()

  if (!props.skills.length) {
    return <div className='text-muted-foreground text-sm'>{t('No skills')}</div>
  }

  return (
    <div className='space-y-3'>
      {props.skills.map((skill) => (
        <details key={skill.id} className='border-border rounded-md border p-3'>
          <summary className='flex cursor-pointer list-none items-start gap-2 text-sm'>
            <ChevronDown
              className='mt-0.5 size-4 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0'>
              <span className='block font-medium break-words'>
                {skill.name}
              </span>
              <span className='text-muted-foreground mt-0.5 block text-xs break-words'>
                {skill.description || t('No description')}
              </span>
            </span>
          </summary>
          <div className='mt-3 space-y-3'>
            {skill.files.map((file) => (
              <details key={file.path} className='bg-muted/30 rounded-md p-3'>
                <summary className='cursor-pointer font-mono text-xs break-all'>
                  {file.path}
                </summary>
                <pre className='mt-2 max-h-96 overflow-auto text-xs whitespace-pre-wrap'>
                  {file.content || t('No content')}
                </pre>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
