import { Check, ChevronDown, KeyRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import type { PlaygroundApiKeyOption } from '../../types'

type PlaygroundApiKeySelectorProps = {
  tokens: PlaygroundApiKeyOption[]
  selectedTokenId: number | null
  onTokenChange: (tokenId: number) => void
  disabled?: boolean
}

export function PlaygroundApiKeySelector(props: PlaygroundApiKeySelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const selectedToken = useMemo(
    () => props.tokens.find((token) => token.id === props.selectedTokenId),
    [props.selectedTokenId, props.tokens]
  )
  const isDisabled = props.disabled || props.tokens.length === 0
  const currentLabel = selectedToken?.name || t('No available API key')

  const selectToken = (tokenId: number) => {
    props.onTokenChange(tokenId)
    setOpen(false)
  }

  const trigger = (
    <Button
      aria-expanded={open}
      className='h-8 max-w-[15rem] justify-start gap-2 border px-2.5 font-medium shadow-none'
      disabled={isDisabled}
      role='combobox'
      size='sm'
      variant='outline'
    >
      <KeyRound className='text-muted-foreground size-3.5 shrink-0' />
      <span className='min-w-0 flex-1 truncate text-left text-xs'>
        {currentLabel}
      </span>
      <ChevronDown className='text-muted-foreground size-3.5 shrink-0 opacity-60' />
    </Button>
  )

  const content = (
    <Command
      className={cn(
        isMobile
          ? 'h-full flex-1 rounded-lg border-0 bg-transparent'
          : 'rounded-lg'
      )}
    >
      <CommandEmpty>{t('No available API key')}</CommandEmpty>
      <CommandList className={isMobile ? '!max-h-full flex-1 p-2' : 'max-h-72'}>
        <CommandGroup>
          {props.tokens.map((token) => (
            <CommandItem
              key={token.id}
              value={String(token.id)}
              onSelect={() => selectToken(token.id)}
              className='data-[selected=true]:bg-muted items-start gap-2 rounded-md px-3 py-2.5'
            >
              <Check
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  token.id === props.selectedTokenId
                    ? 'opacity-100'
                    : 'opacity-0'
                )}
              />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-xs font-medium'>
                  {token.name}
                </span>
                <span className='text-muted-foreground block truncate text-[11px]'>
                  {token.maskedKey} · {token.group || t('Default group')}
                  {token.routingPreference
                    ? ` · ${token.routingPreference}`
                    : ''}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className='flex max-h-[80vh] min-h-[50vh] flex-col'>
          <DrawerHeader className='pb-3 text-left'>
            <DrawerTitle>{t('Select API Key')}</DrawerTitle>
          </DrawerHeader>
          <div className='flex min-h-0 flex-1 flex-col'>{content}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align='start'
        className='w-[min(22rem,calc(100vw-2rem))] rounded-md border p-0 shadow-none'
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
