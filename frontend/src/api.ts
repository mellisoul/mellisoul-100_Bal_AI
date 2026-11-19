export type Topic = { name: string; pages: number[] }

export type Material = {
  id: number
  title: string
  filename: string
  file_type: string
  created_at: string
  question_count: number
  topics: Topic[] | null
}

export type Question = {
  id: number
  material_id: number
  question: string
  options: string[]
  correct_answer: string
  explanation: string
  topic: string
  question_type: 'test' | 'open'
  level: number
  page: number | null
  quality: 'ok' | 'warn' | 'unchecked'
  quality_note: string
}

export type Stats = {
  materials: number
  questions: number
  by_level: Record<string, number>
  tests_taken: number
  correct_answers: number
  average_score: number | null
}

export type GenerateParams = {
  topic: string
  count: number
  level: number
  question_type: 'test' | 'open' | 'mixed'
  verify: boolean
}

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Очень лёгкий',
  2: 'Лёгкий',
  3: 'Средний',
  4: 'Сложный',
  5: 'Очень сложный',
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, init)
  } catch {
    throw new Error('Нет связи с сервером. Проверь, что backend запущен.')
  }

  if (!response.ok) {
    let message = `Ошибка ${response.status}`

    try {
      const data = await response.json()
      if (typeof data.detail === 'string') {
        message = data.detail
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((item: { msg: string }) => item.msg).join('; ')
      }
    } catch {
      message = `Ошибка ${response.status}`
    }

    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const api = {
  materials: () => request<{ materials: Material[] }>('/api/materials').then((r) => r.materials),

  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ material: Material }>('/api/materials', { method: 'POST', body: form }).then(
      (r) => r.material,
    )
  },

  deleteMaterial: (id: number) => request<unknown>(`/api/materials/${id}`, { method: 'DELETE' }),

  detectTopics: (id: number) =>
    request<{ topics: Topic[] }>(`/api/materials/${id}/topics`, { method: 'POST' }).then(
      (r) => r.topics,
    ),

  generate: (id: number, params: GenerateParams) =>
    request<{ questions: Question[]; skipped_duplicates: number }>(
      `/api/materials/${id}/generate`,
      jsonInit('POST', params),
    ),

  questions: (id: number) =>
    request<{ questions: Question[] }>(`/api/materials/${id}/questions`).then((r) => r.questions),

  updateQuestion: (id: number, changes: Partial<Question>) =>
    request<Question>(`/api/questions/${id}`, jsonInit('PUT', changes)),

  deleteQuestion: (id: number) => request<unknown>(`/api/questions/${id}`, { method: 'DELETE' }),

  saveResult: (materialId: number, total: number, correct: number) =>
    request<{ score: number }>(
      '/api/test-results',
      jsonInit('POST', {
        material_id: materialId,
        total_questions: total,
        correct_answers: correct,
      }),
    ),

  stats: () => request<Stats>('/api/stats'),
}
