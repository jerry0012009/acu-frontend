const displayKeys: Record<string, string> = {
  relevantSkillIds: 'relevantPreferenceIds',
  skillCatalog: 'preferenceCatalog',
  skillChangeCount: 'preferenceChangeCount',
  skillChanges: 'preferenceChanges',
  skillsBefore: 'preferencesBefore',
  skillsAfter: 'preferencesAfter',
  skillId: 'preferenceId',
}

// Reading aliases only: never use these values for storage, editing, or tool calls.
export function preferenceDisplayText(value: string): string {
  return value
    .replaceAll(
      /\b(?:relevantSkillIds|skillCatalog|skillChangeCount|skillChanges|skillsBefore|skillsAfter|skillId)\b/g,
      (key) => displayKeys[key]
    )
    .replaceAll(
      /(?<![a-z0-9])skill([ _-])learner(?![a-z0-9])/gi,
      (_, separator: string) =>
        separator === ' ' ? 'Preference Writer' : `preference${separator}writer`
    )
    .replaceAll(/(?<![a-z0-9])skills?(?![a-z0-9])/gi, (word) => {
      const replacement =
        word.toLowerCase() === 'skills' ? 'preferences' : 'preference'
      if (word === word.toUpperCase()) return replacement.toUpperCase()
      if (word[0] === word[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1)
      }
      return replacement
    })
}

export function preferenceDocumentLabel(
  path: string,
  mainLabel: string
): string {
  if (/^(?:\/|\.\/)?SKILL\.md$/i.test(path)) return mainLabel
  return preferenceDisplayText(path)
}
