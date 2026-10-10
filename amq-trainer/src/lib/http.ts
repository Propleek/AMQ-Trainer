const MAX_ATTEMPTS = 5;

/** Découpe un tableau en lots pour les requêtes groupées. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Réponse HTTP en erreur ; `body` contient le JSON renvoyé par l'API, s'il y en a un. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(url: string, status: number, statusText: string, body: unknown) {
    super(`${new URL(url).host} a répondu ${status} ${statusText}`);
    this.status = status;
    this.body = body;
  }
}

/** POST JSON avec relance (voir `requestJson`). */
export function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) },
    signal,
  );
}

/** GET JSON avec relance (voir `requestJson`). */
export function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(url, { headers: { Accept: 'application/json' } }, signal);
}

/**
 * Requête JSON avec relance : attend `Retry-After` sur un 429,
 * temporisation exponentielle sur les erreurs réseau et 5xx.
 */
async function requestJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (e) {
      if (signal?.aborted || attempt >= MAX_ATTEMPTS) throw e;
      await sleep(1000 * 2 ** attempt, signal);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new HttpError(url, response.status, response.statusText, await response.json().catch(() => null));
    }
    const retryAfter = Number(response.headers.get('Retry-After'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt, signal);
  }
}
