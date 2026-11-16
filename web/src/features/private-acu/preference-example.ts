import type { TFunction } from 'i18next'

import type { PreferenceProfileView } from './preference-profile-api'

const domains = [
  [
    'Setup and everyday use',
    [
      'One-click setup with editable defaults',
      'Reuse existing tools before adding new ones',
      'Keep credentials in one trusted place',
      'Show connection status honestly',
      'Make common actions easy to reach',
      'Keep optional integrations independent',
      'Preserve explicit opt-out choices',
      'Recover from interrupted setup',
      'Explain failures with actionable details',
      'Keep daily workflows quiet and predictable',
    ],
  ],
  [
    'Interface and visual expression',
    [
      'Use a restrained multi-color palette',
      'Keep information dense but organized',
      'Use whitespace to clarify hierarchy',
      'Keep typography consistent',
      'Prefer familiar icons for tools',
      'Design mobile layouts deliberately',
      'Keep text readable in both themes',
      'Use motion only with a purpose',
      'Show real creative materials clearly',
      'Keep controls stable while content changes',
    ],
  ],
  [
    'Development and delivery',
    [
      'Verify behavior before claiming success',
      'Keep changes within the requested scope',
      'Reuse established project patterns',
      'Test important failure paths',
      'Separate deployment from code completion',
      'Preserve a working rollback path',
      'Respect concurrent work',
      'Keep local and remote revisions aligned',
      'Report uncertainty explicitly',
      'Deliver a usable end-to-end workflow',
    ],
  ],
  [
    'Documents and finished work',
    [
      'Lead with the conclusion',
      'Keep prompts concise and ready to use',
      'Use headings only when they help',
      'Cite sources for important claims',
      'Separate facts from recommendations',
      'Include acceptance criteria when requested',
      'Keep terminology consistent',
      'Show concrete examples instead of vague claims',
      'Keep deliverables easy to scan',
      'Retain important constraints in final output',
    ],
  ],
  [
    'Research and creative decisions',
    [
      'Compare mature solutions first',
      'Evaluate maintenance cost alongside features',
      'Validate model capabilities with real inputs',
      'Prefer evidence over popularity',
      'Keep reference roles explicit',
      'Judge video with timestamped evidence',
      'Distinguish visual and audio observations',
      'Preserve room for creative exploration',
      'Give specific and minimal corrections',
      'Let current intent override past habits',
    ],
  ],
] as const

export function shouldShowPreferenceExample(
  view?: PreferenceProfileView
): boolean {
  return view?.status === 'empty' && !view.profile?.rays.length
}

export function createPreferenceExample(t: TFunction): PreferenceProfileView {
  return {
    status: 'ready',
    generatedAt: null,
    error: null,
    profile: {
      summary: '',
      sourceCount: 0,
      excluded: [],
      schemaVersion: 'acu-preference-v4',
      rays: domains.flatMap(([category, labels], domain) =>
        labels.map((label, index) => ({
          id: `example-${domain}-${index}`,
          label: t(label),
          category: t(category),
          summary: t(label),
          scope: t('Illustrative only; not saved or used for personalization'),
          score: 35 + ((domain * 17 + index * 23) % 64),
          confidence: 75,
          sourceIds: [],
        }))
      ),
    },
  }
}
