import React, { useState, useEffect, useRef } from 'react';

interface LensResult {
  lensId: string;
  lensName: string;
}

interface LensSearchProps {
  onSelect: (lens: LensResult) => void;
}

export function LensSearch({ onSelect }: LensSearchProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LensResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latestQuery = useRef('');

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      latestQuery.current = query;
      setLoading(true);
      setError(null);

      const response = await window.electronAPI.snapSearch({ query });

      // Ignore stale responses
      if (latestQuery.current !== query) return;
      setLoading(false);

      if (!Array.isArray(response)) {
        setResults([]);
        setError('snap-camera-server не найден на localhost:5645. Запустите snap-camera-server перед настройкой маски.');
        return;
      }
      setResults(response);
    }, 300);

    return (): void => clearTimeout(timer);
  }, [query]);

  const handleSelect = (lens: LensResult): void => {
    setQuery(lens.lensName);
    setResults([]);
    onSelect(lens);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Найти линзу..."
      />
      {loading && <span style={{ marginLeft: '8px', fontSize: '0.8em' }}>Поиск...</span>}
      {error && (
        <div style={{ color: '#c00', fontSize: '0.85em', marginTop: '4px' }}>
          {error}
        </div>
      )}
      {results.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            zIndex: 100,
          }}
        >
          {results.map((lens) => (
            <li
              key={lens.lensId}
              onClick={() => handleSelect(lens)}
              style={{ padding: '6px 10px', cursor: 'pointer' }}
            >
              {lens.lensName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
