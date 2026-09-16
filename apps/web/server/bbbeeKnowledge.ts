import { BBBEE_ONTOLOGY } from "../../api/pipeline/bbbeeOntology";
import OpenAI, { AzureOpenAI } from "openai";

export interface BbbeeKnowledgeSource {
  id: string;
  title: string;
  section: string;
}

export interface BbbeeKnowledgeAnswer {
  answer: string;
  sources: BbbeeKnowledgeSource[];
  ontologyVersion: string;
  matched: boolean;
  answerMode?: "ontology" | "ontology+ai";
}

interface KnowledgeRecord extends BbbeeKnowledgeSource {
  text: string;
  searchText: string;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "from", "how", "i",
  "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when",
  "where", "which", "who", "why", "with", "your", "bbbee", "b-bbee", "bee",
]);

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function searchable(parts: unknown[]): string {
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .join(" ")
    .toLowerCase();
}

function buildKnowledgeIndex(): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];

  for (const [entityName, rawEntity] of Object.entries(BBBEE_ONTOLOGY.entities)) {
    const entity = rawEntity as any;
    records.push({
      id: `entities.${entityName}`,
      title: humanize(entityName),
      section: "Entity",
      text: `${entity.description}. ${entity.scoringRelevance}`,
      searchText: searchable([entityName, entity.description, entity.scoringRelevance, entity.linkedTo]),
    });

    for (const [propertyName, rawProperty] of Object.entries(entity.properties || {})) {
      const property = rawProperty as any;
      const details = [
        property.description,
        property.scoringRelevance,
        property.businessRule,
        property.derivedFrom ? `Derived from ${property.derivedFrom}.` : undefined,
        property.required ? "This is a required field." : undefined,
        property.values?.length ? `Accepted values: ${property.values.join(", ")}.` : undefined,
      ].filter(Boolean).join(" ");
      records.push({
        id: `entities.${entityName}.properties.${propertyName}`,
        title: `${humanize(entityName)}: ${humanize(propertyName)}`,
        section: "Field definition",
        text: details,
        searchText: searchable([entityName, propertyName, property.description, property.aliases, property.scoringRelevance, property.businessRule]),
      });
    }

    for (const [relationshipName, rawRelationship] of Object.entries(entity.relationships || {})) {
      const relationship = rawRelationship as any;
      records.push({
        id: `entities.${entityName}.relationships.${relationshipName}`,
        title: `${humanize(entityName)}: ${humanize(relationshipName)}`,
        section: "Relationship",
        text: [relationship.description, relationship.formula, relationship.scoringThreshold].filter(Boolean).join(" "),
        searchText: searchable([entityName, relationshipName, relationship.description, relationship.formula, relationship.scoringThreshold]),
      });
    }
  }

  for (const [ruleName, rawRule] of Object.entries(BBBEE_ONTOLOGY.businessRules)) {
    const rule = rawRule as any;
    const ruleParts: string[] = [];
    const collect = (value: unknown, label?: string) => {
      if (typeof value === "string" || typeof value === "number") {
        if (label !== "expertNote") ruleParts.push(label ? `${humanize(label)}: ${value}` : String(value));
      } else if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) collect(nested, key);
      }
    };
    collect(rule);
    records.push({
      id: `businessRules.${ruleName}`,
      title: humanize(ruleName),
      section: "Business rule",
      text: ruleParts.join(". "),
      searchText: searchable([ruleName, ruleParts]),
    });
  }

  for (const [enumName, rawEnum] of Object.entries(BBBEE_ONTOLOGY.enums)) {
    const enumDef = rawEnum as any;
    const values = Array.isArray(enumDef.values) ? enumDef.values : [];
    if (!values.length) continue;
    records.push({
      id: `enums.${enumName}`,
      title: humanize(enumName),
      section: "Reference values",
      text: `Recognised values: ${values.join(", ")}.`,
      searchText: searchable([enumName, values, enumDef.descriptions, enumDef.definitions, enumDef.thresholds]),
    });
  }

  return records;
}

const KNOWLEDGE_INDEX = buildKnowledgeIndex();

function queryTerms(question: string): string[] {
  return [...new Set(question.toLowerCase().match(/[a-z0-9%]+/g) || [])]
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

export function answerBbbeeQuestion(question: string): BbbeeKnowledgeAnswer {
  const terms = queryTerms(question);
  if (!terms.length) {
    return {
      answer: "Ask about a B-BBEE field, pillar, threshold, scorecard classification, supplier, employee, learner, ownership, or contribution.",
      sources: [],
      ontologyVersion: BBBEE_ONTOLOGY.version,
      matched: false,
    };
  }

  const ranked = KNOWLEDGE_INDEX
    .map((record) => {
      const title = record.title.toLowerCase();
      const score = terms.reduce((total, term) => {
        if (title === term) return total + 12;
        if (title.includes(term)) return total + 6;
        const occurrences = record.searchText.split(term).length - 1;
        return total + Math.min(occurrences, 4) * 2;
      }, 0);
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
    .slice(0, 4);

  if (!ranked.length) {
    return {
      answer: "I could not find that in the current Okiru B-BBEE ontology. Try using a pillar or data-field name, such as ownership, skills development, procurement, ESD, SED, turnover, supplier, employee, or learner.",
      sources: [],
      ontologyVersion: BBBEE_ONTOLOGY.version,
      matched: false,
    };
  }

  const answer = ranked
    .map(({ record }) => `${record.title}: ${record.text}`)
    .join("\n\n");

  return {
    answer,
    sources: ranked.map(({ record }) => ({ id: record.id, title: record.title, section: record.section })),
    ontologyVersion: BBBEE_ONTOLOGY.version,
    matched: true,
  };
}

function getParserOpenAIConfig(): { client: OpenAI; model: string } | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
  if (endpoint && apiKey && deployment) {
    return {
      client: new AzureOpenAI({
        endpoint,
        apiKey,
        deployment,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      }),
      model: deployment,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return null;
}

/**
 * Uses the parser's existing OpenAI configuration only to explain retrieved
 * ontology facts. Retrieval remains deterministic and is the source of truth.
 */
export async function answerBbbeeQuestionWithAi(question: string): Promise<BbbeeKnowledgeAnswer> {
  const grounded = answerBbbeeQuestion(question);
  if (!grounded.matched) return { ...grounded, answerMode: "ontology" };

  const config = getParserOpenAIConfig();
  if (!config) return { ...grounded, answerMode: "ontology" };

  try {
    const completion = await config.client.chat.completions.create({
      model: config.model,
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: [
            "You are Okiru's B-BBEE guide.",
            "Answer only from the supplied Okiru ontology context.",
            "Do not add legal rules, thresholds, dates, or calculations that are absent from the context.",
            "If the context is incomplete or contains a qualification, state that clearly.",
            "Use concise, plain South African business English. Do not mention being an AI model.",
          ].join(" "),
        },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nOKIRU ONTOLOGY CONTEXT:\n${grounded.answer}`,
        },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim();
    return answer
      ? { ...grounded, answer, answerMode: "ontology+ai" }
      : { ...grounded, answerMode: "ontology" };
  } catch {
    return { ...grounded, answerMode: "ontology" };
  }
}

export async function answerScorecardQuestionWithAi(
  question: string,
  runtimeSnapshot: unknown,
): Promise<BbbeeKnowledgeAnswer> {
  const grounded = answerBbbeeQuestion(question);
  const snapshot = runtimeSnapshot && typeof runtimeSnapshot === "object" ? runtimeSnapshot as any : {};
  const scorecard = snapshot.scorecard && typeof snapshot.scorecard === "object" ? snapshot.scorecard : {};
  const client = snapshot.client && typeof snapshot.client === "object" ? snapshot.client : {};
  const rawLevel = scorecard.isDiscounted ? scorecard.discountedLevel : scorecard.achievedLevel;
  const level = Number.isFinite(Number(rawLevel))
    ? (Number(rawLevel) >= 9 ? "Non-Compliant" : `Level ${Number(rawLevel)}`)
    : "unavailable";
  const totalPoints = Number(scorecard.total?.score);
  const totalText = Number.isFinite(totalPoints) ? `${totalPoints.toFixed(2)} points` : "points unavailable";
  const elements = Object.entries(scorecard)
    .flatMap(([key, value]): Array<{ key: string; score: number; weighting: number; subMinimumMet?: boolean }> => {
      if (!value || typeof value !== "object") return [];
      const score = Number((value as any).score);
      const weighting = Number((value as any).weighting);
      if (!Number.isFinite(score) || !Number.isFinite(weighting) || weighting <= 0 || key === "total") return [];
      return [{ key, score, weighting, subMinimumMet: (value as any).subMinimumMet }];
    });
  const weak = [...elements]
    .sort((a, b) => (a.score / a.weighting) - (b.score / b.weighting))
    .slice(0, 3);
  const failedSubminimums = elements.filter((element) => element.subMinimumMet === false);
  const currentFacts = [
    `${client.name || "Current company"}: ${level}, ${totalText}.`,
    weak.length ? `Lowest-performing elements: ${weak.map((item) => `${humanize(item.key)} ${item.score.toFixed(2)}/${item.weighting}`).join(", ")}.` : "Pillar scores are unavailable.",
    failedSubminimums.length ? `Failed subminimums: ${failedSubminimums.map((item) => humanize(item.key)).join(", ")}.` : "No failed subminimum is present in the supplied scorecard snapshot.",
  ].join(" ");
  const fallbackAnswer = grounded.matched
    ? `${currentFacts}\n\n${grounded.answer}`
    : currentFacts;
  const base: BbbeeKnowledgeAnswer = {
    ...grounded,
    answer: fallbackAnswer,
    matched: Boolean(elements.length || grounded.matched),
    answerMode: "ontology",
  };

  const config = getParserOpenAIConfig();
  if (!config) return base;
  try {
    const completion = await config.client.chat.completions.create({
      model: config.model,
      temperature: 0.1,
      max_tokens: 650,
      messages: [
        {
          role: "system",
          content: "You are Ask Okiru, a B-BBEE scorecard advisor. Use only the supplied scorecard facts and ontology context. Never invent values, evidence, legislation, or calculations. Clearly say when data is unavailable. Keep the answer practical and concise.",
        },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nCURRENT SCORECARD FACTS:\n${currentFacts}\n\nOKIRU ONTOLOGY CONTEXT:\n${grounded.matched ? grounded.answer : "No matching ontology record."}`,
        },
      ],
    });
    const answer = completion.choices[0]?.message?.content?.trim();
    return answer ? { ...base, answer, answerMode: "ontology+ai" } : base;
  } catch {
    return base;
  }
}
