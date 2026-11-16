import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { PlaygroundChat } from './components/chat/playground-chat'
import { ConversationKeyEmpty } from './components/conversation-key-empty'
import { ConversationTabs } from './components/conversation-tabs'
import { PlaygroundInput } from './components/input/playground-input'
import {
  useChatHandler,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'

export function Playground() {
  const { t } = useTranslation()
  const {
    config,
    parameterEnabled,
    messages,
    isLoadingMessages,
    models,
    tokens,
    updateMessages,
    setModels,
    setTokens,
    updateConfig,
    updateParameterEnabled,
    clearMessages,
  } = usePlaygroundState()

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    parameterEnabled,
    selectedTokenId: config.selectedTokenId,
    onMessageUpdate: updateMessages,
  })

  const {
    editingMessageKey,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  } = usePlaygroundConversation({
    messages,
    updateMessages,
    sendChat,
  })

  const handleClearMessages = () => {
    handleEditOpenChange(false)
    clearMessages()
  }

  const { isLoadingModels, hasLoadedOptions, optionsError, retryOptions } =
    usePlaygroundOptions({
      currentModel: config.model,
      setModels,
      selectedTokenId: config.selectedTokenId,
      setTokens,
      updateConfig,
    })

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      <ConversationTabs />
      {hasLoadedOptions && tokens.length === 0 && <ConversationKeyEmpty />}
      {optionsError && (
        <div
          role='alert'
          className='flex items-center gap-3 border-b p-4 text-sm'
        >
          <span>{t('Failed to load ACU conversation options')}</span>
          <Button variant='ghost' size='sm' onClick={retryOptions}>
            {t('Retry')}
          </Button>
        </div>
      )}
      {/* Full-width scroll container: scrolling works even over side whitespace */}
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <PlaygroundChat
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          onRegenerateMessage={handleRegenerateMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onSelectPrompt={handleSendMessage}
          isGenerating={isGenerating}
          editingKey={editingMessageKey}
          onCancelEdit={handleEditOpenChange}
          onSaveEdit={(newContent) => applyEdit(newContent, false)}
          onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
        />
      </div>

      {/* Input area: center content and constrain to the same container width */}
      <div className='mx-auto w-full max-w-4xl'>
        <PlaygroundInput
          config={config}
          disabled={isGenerating}
          isGenerating={isGenerating}
          isModelLoading={isLoadingModels}
          modelValue={config.model}
          models={models}
          tokens={tokens}
          selectedTokenId={config.selectedTokenId}
          onConfigChange={updateConfig}
          onClearMessages={handleClearMessages}
          onModelChange={(value) => updateConfig('model', value)}
          onTokenChange={(value) => updateConfig('selectedTokenId', value)}
          onParameterEnabledChange={updateParameterEnabled}
          onStop={stopGeneration}
          onSubmit={handleSendMessage}
          parameterEnabled={parameterEnabled}
          hasMessages={messages.length > 0}
        />
      </div>
    </div>
  )
}
