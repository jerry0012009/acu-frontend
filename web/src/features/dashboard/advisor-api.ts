import { api } from '@/lib/api'

export type PrivateACUAdvisor = {
  advisorId: string
  newapiUserId: string
  logicalRequestId: string
  triggerCallCount: number
  needAdvisor: boolean
  status: 'ok' | 'risk' | 'blocked'
  problem: string
  advice?: string
  learn: 'none' | 'candidate'
  relevantSkillIds: string[]
  createdAt: string
  userFeedback?: 'helpful' | 'inaccurate' | 'ignored'
  feedbackAt?: string
}

type PrivateACUAdvisorListResponse = {
  success: boolean
  message?: string
  data?: {
    advisors: PrivateACUAdvisor[]
  }
}

export async function getPrivateACUAdvisors(): Promise<PrivateACUAdvisor[]> {
  const response = await api.get<PrivateACUAdvisorListResponse>(
    '/api/user/self/acu-advisor'
  )
  return response.data.data?.advisors ?? []
}

export async function updatePrivateACUAdvisorFeedback(
  advisorId: string,
  feedback: NonNullable<PrivateACUAdvisor['userFeedback']>
): Promise<void> {
  await api.post(
    `/api/user/self/acu-advisor/${encodeURIComponent(advisorId)}/feedback`,
    { feedback }
  )
}
