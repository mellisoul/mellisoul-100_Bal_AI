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
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

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
    setStatus('')
    setUploading(true)

    try {
      await api.upload(file)
      await onChanged()
      setStatus(`«${file.name}» загружен. Теперь найди в нём темы.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
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
    <>
      <header className="page-head">
        <h1>Материалы</h1>
        <p>Учебники и конспекты, из которых AI составляет вопросы.</p>
      </header>

      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) upload(file)
        }}
      >
        <div className="dropzone-text">
          <b>{uploading ? 'Читаю документ…' : 'Перетащи файл сюда'}</b>
          <span>PDF с текстом или TXT, до 10 МБ</span>
        </div>
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
        <button
          className="btn btn-primary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          Выбрать файл
        </button>
      </div>

      {status && <div className="alert">{status}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {materials.length === 0 ? (
        <p className="empty">Здесь появятся загруженные учебники.</p>
      ) : (
        <ul className="shelf">
          {materials.map((material) => {
            const hasTopics = !!material.topics && material.topics.length > 0

            return (
              <li className="book" key={material.id}>
                <div className="book-spine" data-type={material.file_type.toUpperCase()} />
                <div className="book-body">
                  <div className="book-head">
                    <div>
                      <h2>{material.title}</h2>
                      <p>
                        {material.file_type.toUpperCase()}, вопросов: {material.question_count}
                      </p>
                    </div>
                    <div className="row-actions">
                      {hasTopics ? (
                        <button className="btn btn-primary" onClick={() => onGenerate(material.id)}>
                          Создать вопросы
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn-primary"
                            disabled={busyId === material.id}
                            onClick={() => detectTopics(material.id)}
                          >
                            {busyId === material.id ? 'Ищу темы…' : 'Найти темы'}
                          </button>
                          <button className="btn btn-ghost" onClick={() => onGenerate(material.id)}>
                            Создать вопросы
                          </button>
                        </>
                      )}
                      <button className="btn btn-quiet" onClick={() => remove(material)}>
                        Удалить
                      </button>
                    </div>
                  </div>

                  {hasTopics ? (
                    <div className="topics">
                      {material.topics!.map((topic) => (
                        <span className="topic" key={topic.name}>
                          {topic.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="book-hint">Темы ещё не найдены — без них вопросы строятся по всему тексту.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
