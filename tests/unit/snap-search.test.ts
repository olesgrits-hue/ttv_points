import { SnapLensSearch } from '../../src/main/snap/search';

describe('SnapLensSearch', () => {
  let search: SnapLensSearch;

  beforeEach(() => {
    search = new SnapLensSearch();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns_empty_for_short_query', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await search.search('ab');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('returns_empty_for_empty_query', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await search.search('');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('returns_parsed_results', async () => {
    const mockLenses = [
      { id: 'lens-1', name: 'Cool Lens', iconUrl: 'http://example.com/icon.png' },
      { id: 'lens-2', name: 'Another Lens' },
    ];
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockLenses), { status: 200 }),
    );

    const result = await search.search('cool');
    expect(result).toEqual(mockLenses);
  });

  test('validates_response_schema', async () => {
    const mockBody = [
      { id: 'lens-1', name: 'Valid Lens' },
      { name: 'Missing id' }, // no id — invalid
      { id: 'lens-3' }, // no name — invalid
      null, // null — invalid
      { id: 'lens-4', name: 'Another Valid' },
    ];
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockBody), { status: 200 }),
    );

    const result = await search.search('test');
    expect(result).toEqual([
      { id: 'lens-1', name: 'Valid Lens' },
      { id: 'lens-4', name: 'Another Valid' },
    ]);
  });

  test('returns_snap_unavailable_on_connection_error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(
      Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );

    const result = await search.search('test');
    expect(result).toEqual({
      type: 'snap_unavailable',
      message: 'snap-camera-server not found at localhost:5645',
    });
  });

  test('returns_snap_unavailable_on_timeout', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    const result = await search.search('test');
    expect(result).toEqual({
      type: 'snap_unavailable',
      message: 'snap-camera-server not found at localhost:5645',
    });
  });

  test('returns_snap_unavailable_on_non_ok_response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await search.search('test');
    expect(result).toMatchObject({ type: 'snap_unavailable' });
  });

  test('returns_empty_array_when_response_is_not_array', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    const result = await search.search('test');
    expect(result).toEqual([]);
  });

  test('posts_correct_body_to_snap_endpoint', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await search.search('hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5645/vc/v1/explorer/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'hello', offset: 0, limit: 50 }),
      }),
    );
  });
});
