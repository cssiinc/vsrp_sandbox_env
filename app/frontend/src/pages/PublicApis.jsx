import ApiCard from '../ApiCard'

const APIS = [
  { id: 'dog', name: 'Dog CEO', path: '/api/dog', description: 'Random dog images' },
  { id: 'bored', name: 'Bored API', path: '/api/bored', description: 'Random activity suggestions' },
  { id: 'joke', name: 'JokeAPI', path: '/api/joke', description: 'Programming jokes' },
  { id: 'chuck', name: 'Chuck Norris', path: '/api/chuck', description: 'Chuck Norris facts' },
  { id: 'dadjoke', name: 'Dad Jokes', path: '/api/dadjoke', description: 'icanhazdadjoke' },
  { id: 'ghibli', name: 'Studio Ghibli', path: '/api/ghibli', description: 'Random film info' },
  { id: 'weather', name: 'Open-Meteo', path: '/api/weather', description: 'Weather (NYC default)' },
]

export default function PublicApis() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Public APIs Explorer</h1>
        <p className="page-subtitle">
          Proxy via backend &bull; Events logged to RDS &bull;{' '}
          <a href="https://github.com/public-apis/public-apis" target="_blank" rel="noopener noreferrer">
            public-apis
          </a>
        </p>
      </div>
      <div className="api-grid">
        {APIS.map((api) => (
          <ApiCard key={api.id} {...api} />
        ))}
      </div>
    </div>
  )
}
