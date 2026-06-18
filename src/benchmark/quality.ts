import type { QualityScore } from '../types';

const STOPWORDS = new Set([
  'a','an','the','and','but','or','for','nor','so','yet','at','by','in','of',
  'on','to','up','as','is','it','be','was','are','were','been','has','have',
  'had','do','does','did','will','would','could','should','may','might','shall',
  'this','that','these','those','with','from','into','through','during','before',
  'after','above','below','between','out','off','over','under','again','then',
  'also','its','our','their','we','he','she','they','you','i','me','my','your',
  'his','her','him','us','all','each','more','about','than','when','which','who',
  'what','how','if','not','no','can','just','because','some','any',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
}

function extractKeywords(text: string, n = 12): string[] {
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t));
  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function extractCapitalized(text: string): Set<string> {
  const matches = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  return new Set(matches.map((w) => w.toLowerCase()));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Individual scorers (return 0-100) ─────────────────────────────────────

function scoreCoverage(summary: string, source: string): number {
  const keywords = extractKeywords(source, 12);
  if (keywords.length === 0) return 50;
  const sumWords = new Set(tokenize(summary));
  const found = keywords.filter((k) => sumWords.has(k)).length;
  return Math.round((found / keywords.length) * 100);
}

function scoreCompression(summary: string, source: string): number {
  const srcWords = tokenize(source).length;
  const sumWords = tokenize(summary).length;
  if (srcWords === 0) return 0;
  const ratio = (sumWords / srcWords) * 100; // percentage
  // Ideal: 10–25%; peak at 17.5%
  if (ratio >= 10 && ratio <= 25) return 100;
  if (ratio < 10) return Math.max(0, Math.round(ratio * 10)); // too short
  return Math.max(0, Math.round(100 - (ratio - 25) * 3));    // too long
}

function scoreCoherence(summary: string): number {
  const sents = sentences(summary);
  if (sents.length < 2) return 20;
  const wordCounts = sents.map((s) => tokenize(s).length);
  const avg = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  // Penalty for very short or very long sentences
  const sentScore = Math.min(100, Math.max(0, 100 - Math.abs(avg - 15) * 4));
  // Penalty for repeated sentences
  const uniqueSents = new Set(sents.map((s) => s.toLowerCase())).size;
  const repScore = (uniqueSents / sents.length) * 100;
  return Math.round((sentScore + repScore) / 2);
}

function scoreCompleteness(summary: string, source: string): number {
  const srcEntities = extractCapitalized(source);
  if (srcEntities.size === 0) return 70; // can't evaluate
  const sumLower = summary.toLowerCase();
  const retained = [...srcEntities].filter((e) => sumLower.includes(e)).length;
  const ideal = Math.min(srcEntities.size, 5);
  return Math.round(Math.min(100, (retained / ideal) * 100));
}

function scoreClarity(summary: string): number {
  const sents = sentences(summary);
  if (sents.length === 0) return 0;
  const words = tokenize(summary);
  if (words.length === 0) return 0;
  const avgWordsPerSent = words.length / sents.length;
  // Flesch approximation: shorter avg sentence length → clearer
  // Ideal: 10–18 words per sentence
  const clarity = Math.min(100, Math.max(0, 100 - Math.abs(avgWordsPerSent - 14) * 4));
  return Math.round(clarity);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function scoreQuality(summary: string, source: string): QualityScore {
  if (!summary || summary.trim().length < 10) {
    return { coverage: 0, compression: 0, coherence: 0, completeness: 0, clarity: 0, overall: 0 };
  }
  const coverage     = scoreCoverage(summary, source);
  const compression  = scoreCompression(summary, source);
  const coherence    = scoreCoherence(summary);
  const completeness = scoreCompleteness(summary, source);
  const clarity      = scoreClarity(summary);
  const overall = Math.round(
    coverage * 0.30 +
    compression * 0.20 +
    coherence * 0.20 +
    completeness * 0.20 +
    clarity * 0.10,
  );
  return { coverage, compression, coherence, completeness, clarity, overall };
}

export function avgQuality(scores: QualityScore[]): QualityScore {
  if (scores.length === 0) return { coverage: 0, compression: 0, coherence: 0, completeness: 0, clarity: 0, overall: 0 };
  const sum = scores.reduce(
    (acc, s) => ({
      coverage:     acc.coverage     + s.coverage,
      compression:  acc.compression  + s.compression,
      coherence:    acc.coherence    + s.coherence,
      completeness: acc.completeness + s.completeness,
      clarity:      acc.clarity      + s.clarity,
      overall:      acc.overall      + s.overall,
    }),
    { coverage: 0, compression: 0, coherence: 0, completeness: 0, clarity: 0, overall: 0 },
  );
  const n = scores.length;
  return {
    coverage:     Math.round(sum.coverage / n),
    compression:  Math.round(sum.compression / n),
    coherence:    Math.round(sum.coherence / n),
    completeness: Math.round(sum.completeness / n),
    clarity:      Math.round(sum.clarity / n),
    overall:      Math.round(sum.overall / n),
  };
}
