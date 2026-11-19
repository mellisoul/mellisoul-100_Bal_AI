import { useRef, useState } from 'react'
import { api, type Material } from '../api'

type Props = {
  materials: Material[]
  onChanged: () => Promise<void>
  onGenerate: (id: number) => void
}

export default function Materials({ materials, onChanged, onGenerate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const detectTopics = async (id: number) => {
    setBusyId(id)
    setError('')

    try {
      await api.detectTopics(id)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const upload = async (file: File) => {
    setError('')
    setStatus('Загружаю и читаю документ…')

    try {
      await api.upload(file)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
      setStatus('')
      return
    }

    setStatus('Материал загружен. Нажми «Определить темы», чтобы обработать его с помощью AI.')
  }

  const remove = async (material: Material) => {
    if (!window.confirm(`Удалить «${material.title}» вместе с вопросами?`)) return

    try {
      await api.deleteMaterial(material.id)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="content-card">
      <span className="eyebrow">ТВОЯ БИБЛИОТЕКА</span>
      <h2>Мои материалы</h2>
      <p className="muted">Загрузи PDF или TXT — AI найдёт темы, и можно создавать вопросы.</p>

      <div className="upload-box">
        <div className="upload-icon">↑</div>
        <h3>Добавь учебный материал</h3>
        <p>PDF с текстом или TXT, до 10 МБ.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
        <button className="button button-primary" onClick={() => inputRef.current?.click()}>
          Выбрать файл
        </button>
      </div>

      {status && <div className="notice">{status}</div>}
      {error && <div className="q-error">{error}</div>}

      <div className="material-list">
        {materials.length === 0 && <p className="muted">Пока нет материалов.</p>}

        {materials.map((material) => (
          <article className="material-item" key={material.id}>
            <div className="material-head">
              <div>
                <strong>{material.title}</strong>
                <small>
                  {material.file_type.toUpperCase()} · вопросов: {material.question_count}
                </small>
              </div>
              <div className="q-actions">
                <button
                  className="button button-primary"
                  onClick={() => onGenerate(material.id)}
                >
                  Создать вопросы
                </button>
                <button className="button button-danger" onClick={() => remove(material)}>
                  Удалить
                </button>
              </div>
            </div>

            {material.topics && material.topics.length > 0 ? (
              <div className="chips">
                {material.topics.map((topic) => (
                  <span className="chip" key={topic.name}>
                    {topic.name}
                  </span>
                ))}
              </div>
            ) : (
              <button
                className="button button-light"
                disabled={busyId === material.id}
                onClick={() => detectTopics(material.id)}
              >
                {busyId === material.id ? 'Ищу темы…' : 'Определить темы'}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
