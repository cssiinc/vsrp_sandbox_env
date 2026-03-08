import { useState } from 'react'

// Rich content renderers per API response shape
function DogDisplay({ data }) {
  if (!data?.message) return null
  return (
    <figure style={{ margin: 0, marginTop: '1rem' }}>
      <img
        src={data.message}
        alt="Random dog"
        style={{
          width: '100%',
          maxHeight: 280,
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid var(--border)',
        }}
      />
    </figure>
  )
}

function JokeDisplay({ data }) {
  const text = data?.joke ?? data?.value ?? (data?.setup && data?.delivery ? `${data.setup} ${data.delivery}` : null)
  if (!text) return null
  return (
    <blockquote
      style={{
        margin: '1rem 0 0 0',
        padding: '1rem',
        background: 'var(--card-bg)',
        borderLeft: '4px solid var(--accent)',
        borderRadius: '0 6px 6px 0',
        fontStyle: 'italic',
      }}
    >
      {text}
    </blockquote>
  )
}

function BoredDisplay({ data }) {
  if (!data?.activity) return null
  const { activity, type, participants } = data
  return (
    <div style={{ marginTop: '1rem' }}>
      <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>{activity}</p>
      <p style={{ margin: '0.5rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Type: {type} • Participants: {participants}
      </p>
    </div>
  )
}

function WeatherDisplay({ data }) {
  const curr = data?.current
  if (!curr) return null
  const temp = curr.temperature_2m
  const code = curr.weather_code ?? 0
  const desc = code >= 0 && code <= 3 ? 'Clear' : code <= 48 ? 'Foggy' : code <= 67 ? 'Rain' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain' : 'Thunderstorm'
  return (
    <div
      style={{
        marginTop: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <span style={{ fontSize: '2rem', fontWeight: 700 }}>{temp}°C</span>
      <span style={{ color: 'var(--muted)' }}>{desc}</span>
    </div>
  )
}

function GhibliDisplay({ data }) {
  if (!data?.title) return null
  const { title, original_title, release_date, description } = data
  return (
    <div style={{ marginTop: '1rem' }}>
      <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{title}</h4>
      {original_title && original_title !== title && (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>{original_title}</p>
      )}
      <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
        {release_date}
      </p>
      {description && (
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {description.slice(0, 180)}…
        </p>
      )}
    </div>
  )
}

const DISPLAYS = {
  dog: DogDisplay,
  joke: JokeDisplay,
  chuck: JokeDisplay,
  dadjoke: JokeDisplay,
  bored: BoredDisplay,
  weather: WeatherDisplay,
  ghibli: GhibliDisplay,
}

export default function ApiCard({ id, name, path, description }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(path)
      if (!res.ok) throw new Error(res.statusText)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const DisplayComponent = DISPLAYS[id]
  const showRaw = !DisplayComponent || (data && DisplayComponent === JokeDisplay && !data?.joke && !data?.value)

  return (
    <div className="api-card">
      <h3 className="api-card-title">{name}</h3>
      <p className="api-card-desc">{description}</p>
      <button
        className="api-card-btn"
        onClick={fetchData}
        disabled={loading}
      >
        {loading ? 'Loading…' : 'Fetch'}
      </button>
      {error && <p className="api-card-error">{error}</p>}
      {data && DisplayComponent && !showRaw && (
        <DisplayComponent data={data} />
      )}
      {data && showRaw && (
        <pre className="api-card-raw">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  )
}
