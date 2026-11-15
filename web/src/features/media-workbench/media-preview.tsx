import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'

import { mediaLocalURL } from './api'

export function MediaVideoPreview(props: { url: string }) {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    let object = ''
    setSource('')
    setError(false)
    void api
      .get(mediaLocalURL(props.url), {
        responseType: 'blob',
        signal: abort.signal,
      })
      .then((response) => {
        if (abort.signal.aborted) return
        object = URL.createObjectURL(response.data)
        setSource(object)
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true)
      })
    return () => {
      abort.abort()
      if (object) URL.revokeObjectURL(object)
    }
  }, [props.url])
  if (error) {
    return (
      <p role='alert' className='text-destructive p-4 text-sm'>
        {t('Unable to load video')}
      </p>
    )
  }
  if (!source) {
    return (
      <p role='status' className='text-sm'>
        {t('Loading')}
      </p>
    )
  }
  return (
    <video src={source} controls playsInline className='max-h-[70vh] w-full' />
  )
}
