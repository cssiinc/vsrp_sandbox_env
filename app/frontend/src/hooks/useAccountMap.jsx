import { useState, useEffect } from 'react'

let cachedMap = null
let fetchPromise = null

function fetchAccountMap() {
  if (fetchPromise) return fetchPromise
  fetchPromise = fetch('/api/accounts')
    .then(r => r.json())
    .then(accounts => {
      const map = {}
      for (const a of (Array.isArray(accounts) ? accounts : [])) {
        map[a.account_id] = a.account_name
      }
      cachedMap = map
      return map
    })
    .catch(() => {
      cachedMap = {}
      return {}
    })
  return fetchPromise
}

export function useAccountMap() {
  const [accountMap, setAccountMap] = useState(cachedMap || {})

  useEffect(() => {
    if (cachedMap) { setAccountMap(cachedMap); return }
    fetchAccountMap().then(setAccountMap)
  }, [])

  return accountMap
}

export function AccountName({ id, fallback }) {
  const map = useAccountMap()
  const name = map[id]
  if (!name) return <span className="mono">{fallback || id}</span>
  return (
    <span title={id}>
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span className="mono muted" style={{ fontSize: 11, marginLeft: 6 }}>{id}</span>
    </span>
  )
}

export function accountOptions(map) {
  return Object.entries(map)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([id, name]) => ({ id, name, label: `${name} (${id})` }))
}
