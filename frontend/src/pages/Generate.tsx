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

const counts = [5, 10, 15, 20, 30]

const types: { id: GenerateParams['question_type']; title: string }[] = [
  { id: 'mixed', title: 'Смешанные' },
  { id: 'test', title: 'Тесты' },
  { id: 'open', title: 'Открытые' },
]

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
    if (selectedId === null && materials.length > 0) {
      setSelectedId(materials[0].id)
    }
  }, [selectedId, materials, setSelectedId])

  useEffect(() => {
    setTopic('')
    setInfo('')
    setError('')
    setFilter(0)

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
      setFilter(0)
      setInfo(
        `Готово: ${result.questions.length} новых вопросов` +
          (result.skipped_duplicates ? `, повторов отброшено: ${result.skipped_duplicates}` : ''),
      )
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const visible = filter ? questions.filter((q) => q.level === filter) : questions
  const countByLevel = (value: number) => questions.filter((q) => q.level === value).length

  if (materials.length === 0) {
    return (
      <>
        <header className="page-head">
          <h1>Вопросы</h1>
          <p>Чтобы составить вопросы, сначала загрузи учебник.</p>
        </header>
        <button className="btn btn-primary btn-large" onClick={goToMaterials}>
          Загрузить учебник
        </button>
      </>
    )
  }

  return (
    <>
      <header className="page-head">
        <h1>Вопросы</h1>
        <p>AI составляет вопросы только по тексту выбранного материала.</p>
      </header>

      <div className="studio">
        <section className="sheet settings">
          <div className="field">
            <label htmlFor="material">Материал</label>
            <select
              id="material"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="topic">Тема</label>
            <input
              id="topic"
              value={topic}
              placeholder="Весь материал"
              onChange={(e) => setTopic(e.target.value)}
            />
            {material?.topics && material.topics.length > 0 && (
              <div className="topics">
                {material.topics.map((item) => (
                  <button
                    key={item.name}
                    className={`topic topic-button ${topic === item.name ? 'is-active' : ''}`}
                    aria-pressed={topic === item.name}
                    onClick={() => setTopic(topic === item.name ? '' : item.name)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <fieldset className="field">
            <legend>Уровень сложности</legend>
            <div className="level-picker">
              <button
                className={level === 0 ? 'is-active' : ''}
                aria-pressed={level === 0}
                onClick={() => setLevel(0)}
              >
                <span className="level-picker-dots">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <i key={v} className="filled" />
                  ))}
                </span>
                Все уровни поровну
              </button>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  className={level === value ? 'is-active' : ''}
                  aria-pressed={level === value}
                  onClick={() => setLevel(value)}
                >
                  <span className="level-picker-dots">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <i key={v} className={v <= value ? 'filled' : ''} />
                    ))}
                  </span>
                  {LEVEL_NAMES[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Формат</legend>
            <div className="segmented">
              {types.map((item) => (
                <button
                  key={item.id}
                  className={type === item.id ? 'is-active' : ''}
                  aria-pressed={type === item.id}
                  onClick={() => setType(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Сколько вопросов</legend>
            <div className="segmented">
              {counts.map((value) => (
                <button
                  key={value}
                  className={count === value ? 'is-active' : ''}
                  aria-pressed={count === value}
                  onClick={() => setCount(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
            <span>
              Проверить качество
              <small>Ещё один запрос к AI: тема, правильность ответа, уровень</small>
            </span>
          </label>

          <button
            className="btn btn-primary btn-large btn-block"
            onClick={generate}
            disabled={busy || selectedId === null}
          >
            {busy ? 'AI составляет вопросы…' : `Создать ${count} вопросов`}
          </button>

          {busy && <p className="hint">Обычно это занимает до минуты.</p>}
          {info && !busy && <div className="alert alert-ok">{info}</div>}
          {error && <div className="alert alert-error">{error}</div>}
        </section>

        <section className="results">
          <div className="results-head">
            <h2>
              {material?.title ?? 'Материал'}
              <span>{questions.length} вопросов</span>
            </h2>
            <div className="results-tools">
            {questions.length > 0 && selectedId !== null && (
              <div className="export">
                <span>Скачать</span>
                <a className="btn btn-ghost btn-small" href={`/api/materials/${selectedId}/export?format=csv`} download>
                  CSV
                </a>
                <a className="btn btn-ghost btn-small" href={`/api/materials/${selectedId}/export?format=json`} download>
                  JSON
                </a>
              </div>
            )}
            <div className="filter" role="group" aria-label="Фильтр по уровню">
              <button
                className={filter === 0 ? 'is-active' : ''}
                aria-pressed={filter === 0}
                onClick={() => setFilter(0)}
              >
                Все
              </button>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  className={filter === value ? 'is-active' : ''}
                  aria-pressed={filter === value}
                  title={LEVEL_NAMES[value]}
                  onClick={() => setFilter(value)}
                >
                  {value}
                  <small>{countByLevel(value)}</small>
                </button>
              ))}
            </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="empty">
              {questions.length === 0
                ? 'Вопросов пока нет. Настрой параметры слева и нажми «Создать».'
                : 'На этом уровне вопросов нет.'}
            </p>
          ) : (
            <div className="question-list">
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
          )}
        </section>
      </div>
    </>
  )
}
