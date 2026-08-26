export type ExaSearchType = 'auto' | 'fast' | 'instant' | 'deep-lite' | 'deep' | 'deep-reasoning';

export interface ExaContentsConfig {
  highlights?: boolean | { numSentences?: number; highlightsPerUrl?: number };
  text?: boolean | { maxCharacters?: number; verbosity?: 'compact' | 'full'; includeHtmlTags?: boolean };
  summary?: boolean | { query?: string; schema?: object };
  maxAgeHours?: number;
}

export interface ExaSearchOptions {
  query: string;
  type?: ExaSearchType;
  numResults?: number;
  systemPrompt?: string;
  outputSchema?: Record<string, any>;
  contents?: ExaContentsConfig;
  includeDomains?: string[];
  excludeDomains?: string[];
  maxAgeHours?: number;
}

export interface ExaResultItem {
  id: string;
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  highlightScores?: number[];
  text?: string;
  summary?: string;
}

export interface ExaSearchOutput {
  content?: any;
  grounding?: Array<{
    field: string;
    citations: Array<{ url: string; title?: string }>;
    confidence?: string;
  }>;
}

export interface ExaSearchResponse {
  requestId?: string;
  results: ExaResultItem[];
  output?: ExaSearchOutput;
  autopromptString?: string;
}

export interface ExaContentsOptions {
  urls: string[];
  highlights?: boolean | { numSentences?: number };
  text?: boolean | { maxCharacters?: number; verbosity?: 'compact' | 'full' };
  summary?: boolean | { query?: string };
  maxAgeHours?: number;
}

export interface ExaAnswerOptions {
  query: string;
  text?: boolean;
}

export interface ExaAnswerResponse {
  answer: string;
  citations: Array<{
    id: string;
    title: string;
    url: string;
    publishedDate?: string;
    author?: string;
    text?: string;
  }>;
}

const EXA_BASE_URL = 'https://api.exa.ai';

function getExaApiKey(): string | undefined {
  return process.env.EXA_API_KEY || process.env.VITE_EXA_API_KEY;
}

/**
 * Perform an Exa search request.
 */
export async function performExaSearch(options: ExaSearchOptions): Promise<ExaSearchResponse> {
  const apiKey = getExaApiKey();
  if (!apiKey) {
    throw new Error('EXA_API_KEY is not configured in environment variables.');
  }

  const payload: Record<string, any> = {
    query: options.query,
    type: options.type || 'auto',
    numResults: options.numResults || 8,
    contents: options.contents || { highlights: true }
  };

  if (options.systemPrompt) payload.systemPrompt = options.systemPrompt;
  if (options.outputSchema) payload.outputSchema = options.outputSchema;
  if (options.includeDomains && options.includeDomains.length > 0) payload.includeDomains = options.includeDomains;
  if (options.excludeDomains && options.excludeDomains.length > 0) payload.excludeDomains = options.excludeDomains;
  if (typeof options.maxAgeHours === 'number') payload.maxAgeHours = options.maxAgeHours;

  console.log(`[ExaService] Executing search query: "${options.query}" (type: ${payload.type})`);

  const response = await fetch(`${EXA_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ExaService] Search API error ${response.status}: ${errText}`);
    throw new Error(`Exa API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data as ExaSearchResponse;
}

/**
 * Perform an Exa contents extraction request for known URLs.
 */
export async function performExaContents(options: ExaContentsOptions): Promise<{ results: ExaResultItem[] }> {
  const apiKey = getExaApiKey();
  if (!apiKey) {
    throw new Error('EXA_API_KEY is not configured in environment variables.');
  }

  const payload: Record<string, any> = {
    urls: options.urls
  };

  if (options.highlights !== undefined) payload.highlights = options.highlights;
  if (options.text !== undefined) payload.text = options.text;
  if (options.summary !== undefined) payload.summary = options.summary;
  if (typeof options.maxAgeHours === 'number') payload.maxAgeHours = options.maxAgeHours;

  console.log(`[ExaService] Fetching contents for ${options.urls.length} URLs`);

  const response = await fetch(`${EXA_BASE_URL}/contents`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ExaService] Contents API error ${response.status}: ${errText}`);
    throw new Error(`Exa Contents API error (${response.status}): ${errText}`);
  }

  return (await response.json()) as { results: ExaResultItem[] };
}

/**
 * Perform an Exa grounded answer query.
 */
export async function performExaAnswer(options: ExaAnswerOptions): Promise<ExaAnswerResponse> {
  const apiKey = getExaApiKey();
  if (!apiKey) {
    throw new Error('EXA_API_KEY is not configured in environment variables.');
  }

  const payload = {
    query: options.query,
    text: options.text ?? true
  };

  console.log(`[ExaService] Requesting grounded answer for: "${options.query}"`);

  const response = await fetch(`${EXA_BASE_URL}/answer`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ExaService] Answer API error ${response.status}: ${errText}`);
    throw new Error(`Exa Answer API error (${response.status}): ${errText}`);
  }

  return (await response.json()) as ExaAnswerResponse;
}
