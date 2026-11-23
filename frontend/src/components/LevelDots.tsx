import { LEVEL_NAMES } from '../api'

export default function LevelDots({ level, showName = true }: { level: number; showName?: boolean }) {
  return (
    <span className="level-dots" title={`Уровень ${level} из 5: ${LEVEL_NAMES[level]}`}>
      <span className="level-dots-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((value) => (
          <i key={value} className={value <= level ? 'filled' : ''} />
        ))}
      </span>
      {showName && <span className="level-dots-name">{LEVEL_NAMES[level]}</span>}
    </span>
  )
}
