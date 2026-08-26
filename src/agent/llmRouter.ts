import { GoogleGenAI } from '@google/genai';

export enum LLMRequestPriority {
  CRITICAL_INTERACTIVE = 1, // Active chat turns, graph reasoning, tool loops
  STREAMING = 2,            // Real-time token streaming
  BACKGROUND = 3            // Background scan analysis, pre-computations
}

export interface LLMRouterOptions {
  contents: any;
  systemInstruction?: string;
  tools?: any[];
  responseMimeType?: string;
  temperature?: number;
  timeoutMs?: number;
  includeThoughts?: boolean;
  priority?: LLMRequestPriority;
  preferredTier?: 'primary' | 'high_throughput' | 'bedrock' | 'all';
}

export interface LLMFunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface LLMRouterResult {
  text: string;
  functionCalls: LLMFunctionCall[];
  modelUsed: string;
  attemptsCount: number;
  thoughts?: string[];
  rawResponse?: any;
}

/**
 * Production-grade Gemini Model Cascades:
 * Tier 1: Latest Generation Flagships (gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash) - 5 RPM / 20 RPD
 * Tier 2: High-Throughput Workhorse (gemini-3.1-flash-lite) - 15 RPM / 500 RPD
 * Tier 3: Bedrock Fallback (gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-1.5-flash, gemini-2.5-pro, gemini-1.5-pro)
 * Tier 4: NVIDIA GLM-5.2 Deep Reasoning (z-ai/glm-5.2) - 36 RPM smoothed pacing
 */
export const TIER_1_PRIMARY_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash'
];

export const TIER_2_HIGH_THROUGHPUT_MODELS = [
  'gemini-3.1-flash-lite'
];

export const TIER_3_BEDROCK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-pro'
];

export const GEMINI_MODEL_CASCADE = [
  ...TIER_1_PRIMARY_MODELS,
  ...TIER_2_HIGH_THROUGHPUT_MODELS,
  ...TIER_3_BEDROCK_MODELS
];

export class RateLimiterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterTimeoutError';
  }
}

export class AllModelsExhaustedError extends Error {
  public lastError: any;
  constructor(message: string, lastError?: any) {
    super(message);
    this.name = 'AllModelsExhaustedError';
    this.lastError = lastError;
  }
}

export interface ModelLimitSpec {
  maxRpm: number;
  maxRpd: number;
  minIntervalMs: number;
}

// Model rate limits based on exact user telemetry and safe buffers
const MODEL_LIMIT_MAP: Record<string, ModelLimitSpec> = {
  'gemini-3.7-flash': { maxRpm: 5, maxRpd: 20, minIntervalMs: 11000 },
  'gemini-3.6-flash': { maxRpm: 5, maxRpd: 20, minIntervalMs: 11000 },
  'gemini-3.5-flash': { maxRpm: 5, maxRpd: 20, minIntervalMs: 11000 },
  'gemini-3.1-flash-lite': { maxRpm: 15, maxRpd: 500, minIntervalMs: 3800 },
  'gemini-2.5-flash': { maxRpm: 5, maxRpd: 20, minIntervalMs: 11000 },
  'gemini-2.0-flash': { maxRpm: 15, maxRpd: 500, minIntervalMs: 3800 },
  'gemini-2.0-flash-lite': { maxRpm: 30, maxRpd: 1500, minIntervalMs: 1900 },
  'gemini-1.5-flash': { maxRpm: 15, maxRpd: 1500, minIntervalMs: 3800 },
  'gemini-2.5-pro': { maxRpm: 2, maxRpd: 15, minIntervalMs: 28000 },
  'gemini-1.5-pro': { maxRpm: 2, maxRpd: 50, minIntervalMs: 28000 },
  'z-ai/glm-5.2': { maxRpm: 36, maxRpd: 100000, minIntervalMs: 1600 }
};

/**
 * Dynamic Quota & Cooldown Tracker
 * - 429 / RPM bursts: Micro-pacing delay (NO long blacklisting)
 * - Quota exhaustion (RESOURCE_EXHAUSTED / RPD): Progressive cooldown (10m -> 30m -> 2h -> max 4.5h)
 * - Hard ceiling: Never exceeds 5 hours (strictly capped).
 * - Emergency circuit breaker: If all models in cooldown, re-admits oldest cooled model with exponential backoff.
 */
export class ModelQuotaTracker {
  private rpmTimestamps: Map<string, number[]> = new Map();
  private rpdTimestamps: Map<string, number[]> = new Map();
  private cooldownUntil: Map<string, number> = new Map();
  private strikeCounts: Map<string, number> = new Map();
  private lastExecutedAt: Map<string, number> = new Map();

  public getSpec(model: string): ModelLimitSpec {
    return MODEL_LIMIT_MAP[model] || { maxRpm: 5, maxRpd: 20, minIntervalMs: 10000 };
  }

  public canUseModel(model: string): boolean {
    const now = Date.now();
    const cooldown = this.cooldownUntil.get(model) || 0;
    if (now < cooldown) {
      return false;
    }

    const spec = this.getSpec(model);

    // Check sliding 60-second RPM window
    const rpmList = (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000);
    this.rpmTimestamps.set(model, rpmList);
    if (rpmList.length >= spec.maxRpm) {
      return false;
    }

    // Check sliding 24-hour RPD window
    const rpdList = (this.rpdTimestamps.get(model) || []).filter(ts => now - ts < 86400000);
    this.rpdTimestamps.set(model, rpdList);
    if (rpdList.length >= spec.maxRpd) {
      return false;
    }

    return true;
  }

  /**
   * Get estimated delay (in ms) until the model can accept another request.
   * Returns 0 if immediately available (fast-path).
   */
  public getEstimatedWaitMs(model: string): number {
    const now = Date.now();
    const cooldown = this.cooldownUntil.get(model) || 0;
    if (now < cooldown) {
      return cooldown - now;
    }

    const spec = this.getSpec(model);
    const rpmList = (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000);
    this.rpmTimestamps.set(model, rpmList);

    if (rpmList.length < spec.maxRpm) {
      // Check interval since last dispatch
      const lastExec = this.lastExecutedAt.get(model) || 0;
      const intervalDiff = spec.minIntervalMs - (now - lastExec);
      return Math.max(0, intervalDiff);
    }

    // Must wait for oldest request in current 60s window to expire
    const oldest = rpmList[0];
    return Math.max(0, (oldest + 60000) - now);
  }

  public recordUsage(model: string): void {
    const now = Date.now();
    this.lastExecutedAt.set(model, now);

    const rpmList = (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000);
    rpmList.push(now);
    this.rpmTimestamps.set(model, rpmList);

    const rpdList = (this.rpdTimestamps.get(model) || []).filter(ts => now - ts < 86400000);
    rpdList.push(now);
    this.rpdTimestamps.set(model, rpdList);
  }

  /**
   * Mark progressive cooldown on quota exhaustion (10m -> 30m -> 2h -> max 4.5h)
   * Hard ceiling strictly capped at 4.5 - 5 hours.
   */
  public markQuotaExhausted(model: string, reason: 'RPM_BURST' | 'RESOURCE_EXHAUSTED' | 'RPD'): void {
    const now = Date.now();
    if (reason === 'RPM_BURST') {
      // Micro-cooldown of 8 seconds for pacing bursts (does NOT blacklist)
      this.cooldownUntil.set(model, now + 8000);
      console.warn(`[QuotaTracker] Model '${model}' pacing burst delay: 8s.`);
      return;
    }

    const currentStrikes = (this.strikeCounts.get(model) || 0) + 1;
    this.strikeCounts.set(model, currentStrikes);

    let durationMs: number;
    switch (currentStrikes) {
      case 1:
        durationMs = 10 * 60 * 1000; // 10 minutes minimum
        break;
      case 2:
        durationMs = 30 * 60 * 1000; // 30 minutes
        break;
      case 3:
        durationMs = 2 * 60 * 60 * 1000; // 2 hours
        break;
      default:
        durationMs = 4.5 * 60 * 60 * 1000; // 4.5 hours hard ceiling (strictly < 5 hours)
        break;
    }

    // Ensure it NEVER exceeds 5 hours
    durationMs = Math.min(durationMs, 5 * 60 * 60 * 1000);
    this.cooldownUntil.set(model, now + durationMs);
    console.warn(`[QuotaTracker] Model '${model}' marked on cooldown for ${Math.round(durationMs / 60000)}m (Strike #${currentStrikes}, Reason: ${reason}).`);
  }

  /**
   * Emergency re-admission: If all models are on cooldown, re-admit the one with the earliest expiry.
   */
  public emergencyReAdmitOldest(candidates: string[]): string {
    let oldestModel = candidates[0];
    let earliestExpiry = Infinity;

    for (const m of candidates) {
      const expiry = this.cooldownUntil.get(m) || 0;
      if (expiry < earliestExpiry) {
        earliestExpiry = expiry;
        oldestModel = m;
      }
    }

    // Set a tiny jitter delay so it can try immediately
    this.cooldownUntil.set(oldestModel, Date.now() + 500);
    console.warn(`[QuotaTracker] Emergency Circuit Breaker: Re-admitting model '${oldestModel}' for execution.`);
    return oldestModel;
  }

  public getModelStatusMap(): Record<string, { canUse: boolean; waitMs: number; strikes: number; cooldownUntil: number }> {
    const status: Record<string, any> = {};
    for (const model of GEMINI_MODEL_CASCADE.concat(['z-ai/glm-5.2'])) {
      status[model] = {
        canUse: this.canUseModel(model),
        waitMs: this.getEstimatedWaitMs(model),
        strikes: this.strikeCounts.get(model) || 0,
        cooldownUntil: this.cooldownUntil.get(model) || 0
      };
    }
    return status;
  }
}

export const modelQuotaTracker = new ModelQuotaTracker();

interface QueuedTask<T> {
  id: string;
  priority: LLMRequestPriority;
  enqueuedAt: number;
  maxWaitMs: number;
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * Centralized Priority Request Buffer & Rate Limiting Engine
 * 
 * Rules:
 * 1. Fast-Path: When capacity is available, requests dispatch immediately with 0ms wait.
 * 2. Adaptive Buffering: When burst limit is reached, requests queue by priority (1: Critical, 2: Streaming, 3: Background).
 * 3. 10-Second Hard Wait Ceiling: No request ever stays in the queue longer than 10 seconds.
 *    If wait time would exceed 10s on a tier, the router auto-pivots to the next available tier.
 * 4. NVIDIA GLM-5.2 is smoothed at 36 RPM.
 */
class LLMRequestBufferQueue {
  private queue: QueuedTask<any>[] = [];
  private processing: boolean = false;
  private activeInFlight: number = 0;
  private maxConcurrent: number = 6;
  private totalDispatched: number = 0;

  /**
   * Enqueue or fast-path execute a request
   */
  public async execute<T>(
    fn: () => Promise<T>,
    priority: LLMRequestPriority = LLMRequestPriority.CRITICAL_INTERACTIVE,
    maxWaitMs: number = 10000
  ): Promise<T> {
    // Fast-Path: If queue is empty and concurrency is available, dispatch immediately with 0ms delay
    if (this.queue.length === 0 && this.activeInFlight < this.maxConcurrent) {
      this.activeInFlight++;
      this.totalDispatched++;
      try {
        return await fn();
      } finally {
        this.activeInFlight--;
        this.processNext();
      }
    }

    // Adaptive Buffer: Request enters priority queue
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        priority,
        enqueuedAt: Date.now(),
        maxWaitMs,
        fn,
        resolve,
        reject
      };

      // Priority insertion: Priority 1 first, then Priority 2, then Priority 3
      let insertIdx = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (task.priority < this.queue[i].priority) {
          insertIdx = i;
          break;
        }
      }
      this.queue.splice(insertIdx, 0, task);

      // Hard 10-second ceiling timer
      setTimeout(() => {
        const idx = this.queue.findIndex(t => t.id === task.id);
        if (idx !== -1) {
          const timedOutTask = this.queue.splice(idx, 1)[0];
          console.warn(`[RequestBuffer] Task ${timedOutTask.id} reached 10s ceiling in buffer. Dispatching with emergency priority immediately.`);
          this.activeInFlight++;
          timedOutTask.fn()
            .then(timedOutTask.resolve)
            .catch(timedOutTask.reject)
            .finally(() => {
              this.activeInFlight--;
              this.processNext();
            });
        }
      }, maxWaitMs);

      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || this.activeInFlight >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeInFlight < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeInFlight++;
      this.totalDispatched++;

      task.fn()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeInFlight--;
          this.processNext();
        });
    }

    this.processing = false;
  }

  public getMetrics() {
    return {
      queuedRequests: this.queue.length,
      activeInFlight: this.activeInFlight,
      totalDispatched: this.totalDispatched
    };
  }
}

export const llmRequestBufferQueue = new LLMRequestBufferQueue();

let globalAIClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  if (!globalAIClient) {
    globalAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-sana-agent'
        }
      }
    });
  }
  return globalAIClient;
}

/**
 * Format messages into OpenAI chat structure for ChatNVIDIA (z-ai/glm-5.2)
 */
export function formatContentsForNvidia(contents: any, systemInstruction?: string) {
  const messages: { role: string; content: string }[] = [];
  if (systemInstruction && systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }

  if (Array.isArray(contents)) {
    for (const msg of contents) {
      if (typeof msg === 'string') {
        if (msg.trim()) messages.push({ role: 'user', content: msg.trim() });
      } else if (msg.role && Array.isArray(msg.parts)) {
        const partsText: string[] = [];
        for (const p of msg.parts) {
          if (typeof p === 'string') {
            if (p.trim()) partsText.push(p.trim());
          } else if (p.text) {
            if (p.text.trim()) partsText.push(p.text.trim());
          } else if (p.functionCall) {
            partsText.push(`[Tool Request: ${p.functionCall.name}(${JSON.stringify(p.functionCall.args || {})})]`);
          } else if (p.functionResponse) {
            partsText.push(`[Tool Output for ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response || {})}]`);
          } else if (p.inlineData) {
            partsText.push(`[Attached Media: ${p.inlineData.mimeType || 'image'}]`);
          }
        }
        const textContent = partsText.join('\n').trim();
        const role = msg.role === 'model' ? 'assistant' : (msg.role === 'function' ? 'user' : msg.role);
        messages.push({ role: role || 'user', content: textContent || '[User data]' });
      } else if (msg.content) {
        messages.push({ role: msg.role === 'model' ? 'assistant' : (msg.role || 'user'), content: String(msg.content).trim() || '[Message]' });
      }
    }
  } else if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents.trim() || 'Hello' });
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' });
  }

  return messages;
}

function normalizeSchemaForOpenAI(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const copy = Array.isArray(schema) ? [...schema] : { ...schema };
  delete copy.$schema;

  if (typeof copy.type === 'string') {
    copy.type = copy.type.toLowerCase();
  }

  if (copy.properties && typeof copy.properties === 'object') {
    const cleanProps: Record<string, any> = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      cleanProps[k] = normalizeSchemaForOpenAI(v);
    }
    copy.properties = cleanProps;
  }

  if (copy.items) {
    copy.items = normalizeSchemaForOpenAI(copy.items);
  }

  return copy;
}

/**
 * NVIDIA Endpoint client for z-ai/glm-5.2 (Deep Reasoning Model, 36 RPM)
 * Executed through the centralized priority buffer queue.
 */
export async function callNvidiaFallback(options: LLMRouterOptions): Promise<LLMRouterResult> {
  return llmRequestBufferQueue.execute(async () => {
    // Check GLM wait time
    const waitMs = modelQuotaTracker.getEstimatedWaitMs('z-ai/glm-5.2');
    if (waitMs > 0 && waitMs <= 10000) {
      await new Promise(r => setTimeout(r, waitMs));
    }
    modelQuotaTracker.recordUsage('z-ai/glm-5.2');

    const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
    const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

    console.log(`[LLMRouter] Executing GLM-5.2 via NVIDIA Endpoint (36 RPM smoothed)...`);

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 25000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const bodyPayload: any = {
        model: "z-ai/glm-5.2",
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        max_tokens: 16384
      };

      if (options.tools && options.tools.length > 0) {
        const openAiTools: any[] = [];
        for (const t of options.tools) {
          if (t.functionDeclarations && Array.isArray(t.functionDeclarations)) {
            for (const fd of t.functionDeclarations) {
              openAiTools.push({
                type: 'function',
                function: {
                  name: fd.name,
                  description: fd.description,
                  parameters: normalizeSchemaForOpenAI(fd.parameters)
                }
              });
            }
          }
        }
        if (openAiTools.length > 0) {
          bodyPayload.tools = openAiTools;
          bodyPayload.tool_choice = 'auto';
        }
      }

      let response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });

      // Fail-Safe: If tools rejected (HTTP 400), retry immediately without tools
      if (!response.ok && bodyPayload.tools && response.status === 400) {
        console.warn("[LLMRouter] GLM-5.2 rejected tools payload (HTTP 400). Retrying plain text fallback...");
        delete bodyPayload.tools;
        delete bodyPayload.tool_choice;
        response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal
        });
      }

      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          modelQuotaTracker.markQuotaExhausted('z-ai/glm-5.2', 'RPM_BURST');
        }
        throw new Error(`NVIDIA GLM API call failed [HTTP ${response.status}]: ${errText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const responseText = choice?.message?.content || "";
      const functionCalls: LLMFunctionCall[] = [];

      if (choice?.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
        for (const tc of choice.message.tool_calls) {
          if (tc.function?.name) {
            let parsedArgs: Record<string, any> = {};
            try {
              parsedArgs = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function.arguments || {});
            } catch {}
            functionCalls.push({
              name: tc.function.name,
              args: parsedArgs
            });
          }
        }
      }

      return {
        text: responseText,
        functionCalls,
        modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)",
        attemptsCount: 1,
        thoughts: ["[GLM-5.2 Deep Reasoning Active]"],
        rawResponse: data
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`NVIDIA GLM API call timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }, options.priority || LLMRequestPriority.CRITICAL_INTERACTIVE);
}

/**
 * Streaming client for z-ai/glm-5.2
 */
export async function* streamNvidiaFallback(options: LLMRouterOptions) {
  const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  modelQuotaTracker.recordUsage('z-ai/glm-5.2');
  console.log(`[LLMRouter Stream] Streaming via z-ai/glm-5.2...`);

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "z-ai/glm-5.2",
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: 16384,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    if (response.status === 429) {
      modelQuotaTracker.markQuotaExhausted('z-ai/glm-5.2', 'RPM_BURST');
    }
    throw new Error(`NVIDIA GLM Stream failed [HTTP ${response.status}]: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') return;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const deltaText = json.choices?.[0]?.delta?.content;
          if (deltaText) {
            yield {
              chunk: {
                candidates: [
                  {
                    content: {
                      parts: [{ text: deltaText }]
                    }
                  }
                ]
              },
              modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)"
            };
          }
        } catch {
          // ignore chunk parse
        }
      }
    }
  }
}

/**
 * Determine model cascade candidate list based on preferred tier and current availability
 */
function getOrderedCandidates(preferredTier?: string): string[] {
  let candidates: string[] = [];

  if (preferredTier === 'primary') {
    candidates = [...TIER_1_PRIMARY_MODELS, ...TIER_2_HIGH_THROUGHPUT_MODELS, ...TIER_3_BEDROCK_MODELS];
  } else if (preferredTier === 'high_throughput') {
    candidates = [...TIER_2_HIGH_THROUGHPUT_MODELS, ...TIER_1_PRIMARY_MODELS, ...TIER_3_BEDROCK_MODELS];
  } else if (preferredTier === 'bedrock') {
    candidates = [...TIER_3_BEDROCK_MODELS, ...TIER_2_HIGH_THROUGHPUT_MODELS, ...TIER_1_PRIMARY_MODELS];
  } else {
    // Default: Latest generation (3.7/3.6/3.5) -> High-throughput (3.1 Lite) -> Bedrock (2.5/2.0/1.5)
    candidates = [...TIER_1_PRIMARY_MODELS, ...TIER_2_HIGH_THROUGHPUT_MODELS, ...TIER_3_BEDROCK_MODELS];
  }

  // Filter out models currently in long-term quota cooldown
  const available = candidates.filter(m => modelQuotaTracker.canUseModel(m));
  if (available.length > 0) {
    return available;
  }

  // If all models in cascade are cooling down, trigger emergency circuit breaker
  const reAdmitted = modelQuotaTracker.emergencyReAdmitOldest(candidates);
  return [reAdmitted, ...candidates.filter(m => m !== reAdmitted)];
}

/**
 * Generates content using the single-chokepoint priority buffer router.
 * - Enforces zero-wait fast path when slots are open.
 * - Buffers requests on clustering with a 10s maximum ceiling.
 * - Auto-pivots dynamically across tiers if primary models would breach 10s wait.
 * - Dynamic quota cooldown (10m -> 30m -> 2h -> 4.5h max).
 */
export async function generateContentWithRouter(
  options: LLMRouterOptions
): Promise<LLMRouterResult> {
  const priority = options.priority || LLMRequestPriority.CRITICAL_INTERACTIVE;

  return llmRequestBufferQueue.execute(async () => {
    const ai = getGenAIClient();
    if (!ai) {
      console.warn("[LLMRouter] GEMINI_API_KEY is missing. Directly routing to z-ai/glm-5.2.");
      return callNvidiaFallback(options);
    }

    const timeoutMs = options.timeoutMs || 15000;
    let attemptsCount = 0;
    let lastError: any = null;

    const candidateModels = getOrderedCandidates(options.preferredTier);

    for (const model of candidateModels) {
      const waitMs = modelQuotaTracker.getEstimatedWaitMs(model);
      
      // If waiting for this model exceeds our 10-second ceiling, pivot immediately to the next tier model
      if (waitMs > 10000) {
        console.log(`[LLMRouter] Model '${model}' estimated wait is ${Math.round(waitMs / 1000)}s (>10s ceiling). Dynamic load-shedding to next tier...`);
        continue;
      }

      // If a micro-wait is required (e.g. 500ms - 2000ms), wait smoothly
      if (waitMs > 0) {
        await new Promise(r => setTimeout(r, waitMs));
      }

      attemptsCount++;
      let modelRetries = 0;
      const maxModelRetries = 1;

      while (modelRetries <= maxModelRetries) {
        try {
          modelQuotaTracker.recordUsage(model);

          const result = await Promise.race([
            (async () => {
              const config: any = {};
              if (options.systemInstruction) {
                config.systemInstruction = options.systemInstruction;
              }
              if (options.responseMimeType) {
                config.responseMimeType = options.responseMimeType;
              }
              if (options.temperature !== undefined) {
                config.temperature = options.temperature;
              }
              if (options.includeThoughts) {
                config.thinkingConfig = { includeThoughts: true };
              }
              if (options.tools && options.tools.length > 0) {
                config.tools = options.tools;
              }

              const response = await ai.models.generateContent({
                model,
                contents: options.contents,
                config: Object.keys(config).length > 0 ? config : undefined
              });

              const functionCalls: LLMFunctionCall[] = [];
              const thoughts: string[] = [];
              const actualTextParts: string[] = [];

              if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                  if ((part as any).thought) {
                    const tVal = typeof (part as any).thought === 'string'
                      ? (part as any).thought
                      : (part.text || '');
                    if (tVal) thoughts.push(tVal);
                  } else if (part.text) {
                    actualTextParts.push(part.text);
                  }

                  if (part.functionCall) {
                    functionCalls.push({
                      name: part.functionCall.name,
                      args: (part.functionCall.args as Record<string, any>) || {}
                    });
                  }
                }
              } else if (response.text) {
                actualTextParts.push(response.text);
              }

              if (response.functionCalls && response.functionCalls.length > 0) {
                for (const fc of response.functionCalls) {
                  if (!functionCalls.some(f => f.name === fc.name)) {
                    functionCalls.push({
                      name: fc.name,
                      args: (fc.args as Record<string, any>) || {}
                    });
                  }
                }
              }

              const text = actualTextParts.join('').trim();

              return {
                text,
                functionCalls,
                thoughts: thoughts.length > 0 ? thoughts : undefined,
                rawResponse: response
              };
            })(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout after ${timeoutMs}ms on model '${model}'`)),
                timeoutMs
              )
            )
          ]);

          if (result.text || (result.functionCalls && result.functionCalls.length > 0)) {
            console.log(`[LLMRouter] Successfully dispatched using model '${model}' (attempt #${attemptsCount})`);
            return {
              text: result.text,
              functionCalls: result.functionCalls,
              modelUsed: model,
              attemptsCount,
              rawResponse: result.rawResponse
            };
          }
          break;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`[LLMRouter] Model '${model}' failed:`, errMsg);
          lastError = err;

          const isNotFound = /404|NOT_FOUND|not found/i.test(errMsg);
          const isRpdExhausted = /per day|RPD|daily quota/i.test(errMsg);
          const isQuotaExceeded = /429|RESOURCE_EXHAUSTED|RATE_LIMIT|quota/i.test(errMsg);
          const isTransient = /503|UNAVAILABLE|500|high demand/i.test(errMsg);

          if (isNotFound) {
            modelQuotaTracker.markQuotaExhausted(model, 'RPD');
            break;
          }

          if (isQuotaExceeded || isRpdExhausted) {
            // Distinguish rate limit burst from true daily quota exhaustion
            if (isRpdExhausted || /RESOURCE_EXHAUSTED/i.test(errMsg)) {
              modelQuotaTracker.markQuotaExhausted(model, isRpdExhausted ? 'RPD' : 'RESOURCE_EXHAUSTED');
            } else {
              modelQuotaTracker.markQuotaExhausted(model, 'RPM_BURST');
            }
            break; // Cascade to next model immediately
          }

          if (isTransient && modelRetries < maxModelRetries) {
            modelRetries++;
            const delayMs = 250 * Math.pow(2, modelRetries) + Math.floor(Math.random() * 50);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          break;
        }
      }
    }

    console.warn(`[LLMRouter] Gemini cascade exhausted or delayed. Pivoting to GLM-5.2 Deep Reasoning fallback...`);
    try {
      return await callNvidiaFallback(options);
    } catch (nvidiaErr: any) {
      throw new AllModelsExhaustedError(
        `All Gemini models and GLM-5.2 fallback failed in router. Gemini last error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
        lastError
      );
    }
  }, priority);
}

/**
 * Streaming content generation using quota-aware cascade
 */
export async function* generateContentStreamWithRouter(options: LLMRouterOptions) {
  const ai = getGenAIClient();
  if (!ai) {
    console.warn("[LLMRouter Stream] GEMINI_API_KEY is missing. Streaming via GLM-5.2.");
    yield* streamNvidiaFallback(options);
    return;
  }

  let lastError: any = null;
  const candidateModels = getOrderedCandidates(options.preferredTier);

  for (const model of candidateModels) {
    const waitMs = modelQuotaTracker.getEstimatedWaitMs(model);
    if (waitMs > 10000) continue;
    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, waitMs));
    }

    try {
      modelQuotaTracker.recordUsage(model);

      const config: any = {};
      if (options.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }
      if (options.temperature !== undefined) {
        config.temperature = options.temperature;
      }
      if (options.includeThoughts) {
        config.thinkingConfig = { includeThoughts: true };
      }

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: options.contents,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      for await (const chunk of responseStream) {
        yield { chunk, modelUsed: model };
      }
      return;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[LLMRouter Stream] Model '${model}' stream failed:`, errMsg);
      lastError = err;
      const isRpdExhausted = /per day|RPD|daily quota/i.test(errMsg);
      modelQuotaTracker.markQuotaExhausted(model, isRpdExhausted ? 'RPD' : 'RPM_BURST');
    }
  }

  console.warn(`[LLMRouter Stream] All Gemini models stream failed. Falling back to GLM-5.2 stream...`);
  try {
    yield* streamNvidiaFallback(options);
  } catch (nvidiaErr: any) {
    throw new AllModelsExhaustedError(
      `All Gemini models and GLM-5.2 stream fallback failed. Gemini error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
      lastError
    );
  }
}

export function getRouterMetrics() {
  return {
    queue: llmRequestBufferQueue.getMetrics(),
    models: modelQuotaTracker.getModelStatusMap()
  };
}
