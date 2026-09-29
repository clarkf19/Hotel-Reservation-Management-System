/**
 * UML «interface» AIConciergeService (external actor "AI Concierge Service")
 *   + handleQuery(query: String): String
 * Relationship: AIConversation ..uses..> AIConciergeService
 * SRS: SI-3.1, AI.Query, AI.FAQ.Answer ("maintained knowledge base"), AI.Query.Escalate
 * Activity: AI Concierge lane "Process Natural-Language Request (NLP)" ->
 *           "Provide FAQ / Booking Assistance" | "Provide Local Recommendations"
 *
 * Two interchangeable implementations:
 *   - KnowledgeBaseConcierge: always available, no API key. Scores the question against the
 *     faq_entries knowledge base; below a confidence threshold the request is unresolved.
 *   - ClaudeConcierge: used only when ANTHROPIC_API_KEY is set. Sends the question plus the
 *     knowledge base to Claude (Anthropic Messages API) and falls back to the knowledge base
 *     on any error. Responses are labelled with their real source so the UI never claims an
 *     LLM answered when it did not.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const STOP = new Set('a an the is are was were be to of in on at for and or i me my we our you your it can could would will do does did what when where how which who please hotel there any have has with from about this that get need want'.split(' '));

export function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, ''));
}

export class KnowledgeBaseConcierge {
  constructor(entries) {
    this.entries = entries.map((e) => ({ ...e, terms: new Set([...tokenize(e.question), ...e.keywords.flatMap(tokenize)]) }));
  }

  /** Returns { answer, score, entry } for the best matching knowledge-base entry. */
  match(query) {
    const q = tokenize(query);
    if (!q.length) return { answer: null, score: 0 };
    let best = { score: 0 };
    for (const e of this.entries) {
      const hits = q.filter((t) => e.terms.has(t)).length;
      const score = hits / Math.max(2, Math.min(q.length, 6));
      if (score > best.score) best = { score, entry: e };
    }
    return { answer: best.entry?.answer ?? null, score: Math.min(1, best.score), entry: best.entry };
  }

  async handleQuery(query) {
    const m = this.match(query);
    return { text: m.answer, confidence: m.score, category: m.entry?.category ?? null, source: 'KNOWLEDGE_BASE' };
  }
}

export class ClaudeConcierge {
  constructor(entries, { apiKey = env.anthropicApiKey, model = env.anthropicModel } = {}) {
    this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    this.model = model;
    this.kb = entries.map((e) => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n');
  }

  async handleQuery(query, { guestName, hotelName, stay, history = [] } = {}) {
    const system = [
      `You are the AI concierge of ${hotelName}. Answer the guest's question briefly (at most 4 sentences), warmly and accurately.`,
      'Use ONLY the hotel knowledge base and stay details below for hotel-specific facts (times, prices, locations, policies). Never invent hotel facts.',
      'If the knowledge base does not contain the answer, or the guest needs a human (complaint, billing dispute, emergency, anything you cannot do), reply with exactly the single word ESCALATE.',
      `Guest: ${guestName || 'guest'}. ${stay ? `Current/next stay: ${stay}.` : 'No active stay.'}`,
      `\nHOTEL KNOWLEDGE BASE\n${this.kb}`,
    ].join('\n');
    const messages = [...history.slice(-6).flatMap((h) => [{ role: 'user', content: h.query }, { role: 'assistant', content: h.response }]), { role: 'user', content: query }];
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 1024, // concierge replies are deliberately short
      system,
      messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') return { text: null, confidence: 0, source: 'LLM', escalate: true };
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text || /^ESCALATE\.?$/i.test(text)) return { text: null, confidence: 0, source: 'LLM', escalate: true };
    return { text, confidence: 0.9, source: 'LLM' };
  }
}

export const llmAvailable = () => Boolean(env.anthropicApiKey);
