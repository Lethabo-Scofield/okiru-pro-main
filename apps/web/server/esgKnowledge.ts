import OpenAI, { AzureOpenAI } from "openai";
import {
  ESG_ONTOLOGY,
  type EsgSource,
} from "../../api/pipeline/esgOntology";

export type EsgAnswerSource = {
  type: "ontology" | "scorecard";
  id: string;
  label: string;
  slides?: number[];
};

export type EsgKnowledgeAnswer = {
  answer: string;
  sources: EsgAnswerSource[];
  warnings: string[];
  matched: boolean;
  answerMode: "ontology" | "ontology+ai";
};

type KnowledgeRecord = {
  id: string;
  label: string;
  text: string;
  searchText: string;
  source: EsgSource;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "from", "how", "i",
  "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when",
  "where", "which", "who", "why", "with", "your", "esg", "scorecard",
]);

function searchable(parts: unknown[]): string {
  return parts.flatMap((part) => Array.isArray(part) ? part : [part])
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .join(" ")
    .toLowerCase();
}

function buildIndex(): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];
  for (const topic of ESG_ONTOLOGY.topics) {
    records.push({
      id: `topics.${topic.id}`,
      label: topic.name,
      text: `${topic.description} Candidate metrics: ${topic.candidateMetrics.join(", ")}.`,
      searchText: searchable([topic.id, topic.name, topic.description, topic.aliases, topic.candidateMetrics, topic.bbbeeLinks]),
      source: topic.source,
    });
  }
  for (const framework of ESG_ONTOLOGY.frameworks) {
    records.push({
      id: `frameworks.${framework.code}`,
      label: framework.name,
      text: `${framework.scope} Materiality: ${framework.materiality.join(", ")}. Primary audience: ${framework.primaryAudience.join(", ")}. ${framework.mandatoryBasis} Core requirements: ${framework.coreRequirements.join(", ")}.`,
      searchText: searchable([framework.code, framework.name, framework.scope, framework.materiality, framework.primaryAudience, framework.coreRequirements, framework.relatedFrameworks]),
      source: framework.source,
    });
  }
  for (const metric of ESG_ONTOLOGY.metrics) {
    records.push({
      id: `metrics.${metric.id}`,
      label: metric.name,
      text: `${metric.description} Unit: ${metric.unit}.${metric.calculation ? ` Calculation: ${metric.calculation}.` : ""} Evidence: ${metric.evidence.join(", ")}.`,
      searchText: searchable([metric.id, metric.name, metric.description, metric.unit, metric.calculation, metric.evidence, metric.frameworks]),
      source: metric.source,
    });
  }
  for (const [code, materiality] of Object.entries(ESG_ONTOLOGY.materiality)) {
    records.push({
      id: `materiality.${code}`,
      label: `${code[0].toUpperCase()}${code.slice(1)} materiality`,
      text: `${materiality.question} Perspective: ${materiality.perspective}. Used by: ${materiality.frameworks.join(", ")}.`,
      searchText: searchable([code, materiality.question, materiality.perspective, materiality.frameworks]),
      source: materiality.source,
    });
  }
  for (const role of ESG_ONTOLOGY.governanceRoles) {
    records.push({
      id: `governanceRoles.${role.id}`,
      label: role.name,
      text: role.responsibilities.join(". "),
      searchText: searchable([role.id, role.name, role.responsibilities]),
      source: role.source,
    });
  }
  for (const step of ESG_ONTOLOGY.implementationSteps) {
    records.push({
      id: `implementation.${step.id}`,
      label: step.name,
      text: `Step ${step.order}. Outputs: ${step.outputs.join(", ")}.`,
      searchText: searchable([step.id, step.name, step.outputs]),
      source: step.source,
    });
  }
  return records;
}

const KNOWLEDGE_INDEX = buildIndex();

function queryTerms(question: string): string[] {
  return [...new Set(question.toLowerCase().match(/[a-z0-9]+/g) || [])]
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function retrieve(question: string): KnowledgeRecord[] {
  const terms = queryTerms(question);
  return KNOWLEDGE_INDEX.map((record) => {
    const label = record.label.toLowerCase();
    const score = terms.reduce((total, term) => {
      if (label === term) return total + 12;
      if (label.includes(term)) return total + 6;
      return total + Math.min(record.searchText.split(term).length - 1, 4) * 2;
    }, 0);
    return { record, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.record.label.localeCompare(b.record.label))
    .slice(0, 4)
    .map(({ record }) => record);
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value: unknown): string {
  const parsed = finite(value);
  if (parsed == null) return "unavailable";
  return `${(parsed <= 1 ? parsed * 100 : parsed).toFixed(1)}%`;
}

function scorecardContext(runtimeSnapshot: unknown): { text: string; hasData: boolean } {
  const snapshot = runtimeSnapshot && typeof runtimeSnapshot === "object" ? runtimeSnapshot as any : {};
  const scorecard = snapshot.scorecard && typeof snapshot.scorecard === "object" ? snapshot.scorecard : null;
  if (!scorecard) return { text: "No current ESG scorecard data was supplied.", hasData: false };

  const pillars = ["environmental", "social", "governance"].map((key) => ({
    key,
    score: finite(scorecard[key]?.score),
    max: finite(scorecard[key]?.max),
    percent: finite(scorecard[key]?.percent),
  }));
  const weak = pillars.filter((item) => item.score != null && item.max != null && item.max > 0)
    .sort((a, b) => (a.score! / a.max!) - (b.score! / b.max!))[0];
  const facts = [
    `${snapshot.companyName || "Current company"}: overall ESG ${percent(scorecard.overallPercent)}.`,
    `Pillars: ${pillars.map((item) => `${item.key} ${item.score?.toFixed(1) ?? "-"}/${item.max?.toFixed(0) ?? "-"}`).join(", ")}.`,
    weak ? `Lowest-performing pillar: ${weak.key} (${weak.score!.toFixed(1)}/${weak.max!.toFixed(0)}).` : "Pillar scores are unavailable.",
    finite(scorecard.scope1Tco2e) != null ? `Scope 1: ${finite(scorecard.scope1Tco2e)!.toFixed(2)} tCO2e.` : "Scope 1 is unavailable.",
    finite(scorecard.scope2Tco2e) != null ? `Scope 2: ${finite(scorecard.scope2Tco2e)!.toFixed(2)} tCO2e.` : "Scope 2 is unavailable.",
    finite(scorecard.wasteDiversionPct) != null ? `Waste diversion: ${percent(scorecard.wasteDiversionPct)}.` : "Waste diversion is unavailable.",
    scorecard.ltifr != null && scorecard.ltifr !== "" ? `LTIFR: ${scorecard.ltifr}.` : "LTIFR is unavailable.",
  ];
  return { text: facts.join(" "), hasData: true };
}

function getOpenAIConfig(): { client: OpenAI; model: string } | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
  if (endpoint && apiKey && deployment) {
    return {
      client: new AzureOpenAI({ endpoint, apiKey, deployment, apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview" }),
      model: deployment,
    };
  }
  return process.env.OPENAI_API_KEY
    ? { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: process.env.OPENAI_MODEL || "gpt-4o-mini" }
    : null;
}

export function answerEsgQuestion(question: string, runtimeSnapshot?: unknown): EsgKnowledgeAnswer {
  const context = scorecardContext(runtimeSnapshot);
  const scoreOnlyQuestion = /(?:which|what).*(?:pillar|score).*(?:weak|lowest|reduc)|(?:weak|lowest).*(?:pillar|score)|explain (?:our|the) (?:overall )?score/i.test(question);
  const records = scoreOnlyQuestion && context.hasData ? [] : retrieve(question);
  const ontologyText = records.map((record) => `${record.label}: ${record.text}`).join("\n\n");
  const matched = records.length > 0 || context.hasData;
  const warnings = records.some((record) => record.source.timeSensitive)
    ? ["This answer includes time-sensitive regulatory information. Confirm current scope and dates with the relevant authority."]
    : [];
  return {
    answer: [context.hasData ? context.text : "", ontologyText || (!context.hasData ? "I could not find that in the current Okiru ESG ontology. Ask about materiality, frameworks, emissions, evidence, governance, or an ESG pillar." : "")].filter(Boolean).join("\n\n"),
    sources: [
      ...(context.hasData ? [{ type: "scorecard" as const, id: "current-esg-scorecard", label: "Current ESG scorecard" }] : []),
      ...records.map((record) => ({ type: "ontology" as const, id: record.id, label: record.label, slides: record.source.slides })),
    ],
    warnings,
    matched,
    answerMode: "ontology",
  };
}

export async function answerEsgQuestionWithAi(question: string, runtimeSnapshot?: unknown): Promise<EsgKnowledgeAnswer> {
  const grounded = answerEsgQuestion(question, runtimeSnapshot);
  if (!grounded.matched) return grounded;
  const config = getOpenAIConfig();
  if (!config) return grounded;
  try {
    const completion = await config.client.chat.completions.create({
      model: config.model,
      temperature: 0.1,
      max_tokens: 650,
      messages: [
        {
          role: "system",
          content: "You are Ask Okiru for ESG. Answer only from the supplied ESG ontology and current scorecard facts. Never invent scores, regulations, dates, emission factors, evidence, or calculations. Clearly identify missing data. Keep the answer practical and concise. Do not mention being an AI model.",
        },
        { role: "user", content: `QUESTION:\n${question}\n\nGROUNDED OKIRU CONTEXT:\n${grounded.answer}` },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim();
    return answer ? { ...grounded, answer, answerMode: "ontology+ai" } : grounded;
  } catch {
    return grounded;
  }
}
