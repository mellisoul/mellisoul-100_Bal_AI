import { useEffect, useState } from 'react'
import { api, LEVEL_NAMES, type GenerateParams, type Material, type Question } from '../api'
import QuestionCard from '../components/QuestionCard'

type Props = {
  materials: Material[]
  selectedId: number | null
  setSelectedId: (id: number | null) => void
  onChanged: () => Promise<void>
  goToMaterials: () => void
}

export default function Generate({
  materials,
  selectedId,
  setSelectedId,
  onChanged,
  goToMaterials,
}: Props) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(10)
  const [level, setLevel] = useState(0)
  const [type, setType] = useState<GenerateParams['question_type']>('mixed')
  const [verify, setVerify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [filter, setFilter] = useState(0)

  const material = materials.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    setTopic('')
    setInfo('')
    setError('')

    if (selectedId === null) {
      setQuestions([])
      return
    }

    api
      .questions(selectedId)
      .then(setQuestions)
      .catch((e: Error) => setError(e.message))
  }, [selectedId])

  const generate = async () => {
    if (selectedId === null) return

    setBusy(true)
    setError('')
    setInfo('')

    try {
      const result = await api.generate(selectedId, {
        topic,
        count,
        level,
        question_type: type,
        verify,
      })
      setQuestions((current) => [...result.questions, ...current])
      setInfo(
        `Создано вопросов: ${result.questions.length}` +
          (result.skipped_duplicates ? `, отброшено повторов: ${result.skipped_duplicates}` : ''),
      )
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const visible = filter ? questions.filter((q) => q.level === filter) : questions

  if (materials.length === 0) {
    return (
      <section className="content-card">
        <span className="eyebrow">AI QUESTION STUDIO</span>
        <h2>Создай свой набор вопросов</h2>
        <p className="muted">Сначала загрузи учебный материал.</p>
        <button className="button button-primary" onClick={goToMaterials}>
          Загрузить материал →
        </button>
      </section>
    )
  }

  return (
    <>
      <section className="content-card">
        <span className="eyebrow">AI QUESTION STUDIO</span>
        <h2>Создай свой набор вопросов</h2>
        <p className="muted">AI составит вопросы строго по выбранному материалу и теме.</p>

        <div className="form-grid">
          <label>
            Материал
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Выбери материал</option>
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Тема
            <input
              list="topic-options"
              value={topic}
              placeholder="Весь материал или своя тема"
              onChange={(e) => setTopic(e.target.value)}
            />
            <datalist id="topic-options">
              {material?.topics?.map((item) => (
                <option key={item.name} value={item.name} />
              ))}
            </datalist>
          </label>

          <label>
            Количество вопросов
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20, 30].map((value) => (
                <option key={value} value={value}>
                  {value} вопросов
                </option>
              ))}
            </select>
          </label>

          <label>
            Уровень сложности
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              <option value={0}>Все 5 уровней</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} — {LEVEL_NAMES[value]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Формат
            <select
              value={type}
              onChange={(e) => setType(e.target.value as GenerateParams['question_type'])}
            >
              <option value="test">Тест с вариантами ответов</option>
              <option value="open">Открытые вопросы</option>
              <option value="mixed">Смешанный</option>
            </select>
          </label>

          <label className="q-check">
            <input
              type="checkbox"
              checked={verify}
              onChange={(e) => setVerify(e.target.checked)}
            />
            Проверить качество вопросов (дополнительный запрос к AI)
          </label>
        </div>

        {material?.topics && material.topics.length > 0 && (
          <div className="chips">
            {material.topics.map((item) => (
              <button
                key={item.name}
                className={`chip chip-button ${topic === item.name ? 'active' : ''}`}
                onClick={() => setTopic(topic === item.name ? '' : item.name)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {busy && <div className="notice">AI создаёт вопросы, это может занять до минуты…</div>}
        {info && !busy && <div className="notice">{info}</div>}
        {error && <div className="q-error">{error}</div>}

        <button
          className="button button-primary"
          onClick={generate}
          disabled={busy || selectedId === null}
        >
          {busy ? 'Генерирую…' : '✦ Создать вопросы'}
        </button>
      </section>

      {selectedId !== null && (
        <section className="content-card">
          <div className="section-heading">
            <div>
              <h3>Вопросы по материалу ({questions.length})</h3>
              <p className="muted">Можно изменить или удалить неудачные вопросы.</p>
            </div>
            <select value={filter} onChange={(e) => setFilter(Number(e.target.value))}>
              <option value={0}>Все уровни</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  Уровень {value}
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 && <p className="muted">Вопросов пока нет.</p>}

          <div className="q-list">
            {visible.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                onChange={(updated) =>
                  setQuestions((current) =>
                    current.map((item) => (item.id === updated.id ? updated : item)),
                  )
                }
                onDelete={(id) => {
                  setQuestions((current) => current.filter((item) => item.id !== id))
                  onChanged()
                }}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
