import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { type HnFeedSnapshot } from '@/app/lib/hnFeeds';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

const FIRST_ROUND_PROMPT = `FIRST-ROUND CLEANING PROMPT (Output = ONLY relevant cleaned data)

"You are a problem-filtering agent.

Given an item of text, decide if it contains a real, actionable problem.

If yes → output ONLY the cleaned, relevant problem-related text.

If no → output NOTHING.

KEEP ONLY IF the text contains:

a workflow problem

a complaint or frustration

a manual process

a workaround (Excel, scripts, hacks)

a broken system/process

a bottleneck or inefficiency

a repeated pain

an unmet need

an expensive/time-consuming issue

a clear indication of something people struggle with

REMOVE IF it is:

news

opinion

hype

general discussion

theory

storytelling

anything without concrete pain or workflow issues

OUTPUT FORMAT:

Only the cleaned problem-related snippet.

If irrelevant, output NOTHING"`;

const SECOND_ROUND_PROMPT = ` You are a venture-scale problem analysis agent.
Your job is to extract ALL meaningful pain points, inefficiencies, frustrations, bottlenecks, and unmet needs from the text.
Importantly if you find a new infrastructure that enabled new SaaS or consumers apps to be built which saves time or money, or for consumer apps which has viral loops, network effects, increases dopamine
Do NOT output scores, categories, lists, labels, or reasoning steps.
Output ONLY clear description of problems, opportunities, and buying intent.

Your Internal Evaluation (DO NOT OUTPUT DIRECTLY):

Pain severity

Frequency

How desperate the users are

Whether they would pay

Why now (AI, regulation, cost shift, workflow change, behavior change)

Size of market (is it large enough?)

Whether a moat can form (data, workflow lock-in, switching cost, integrations, network effects)

Whether the problem expands into something bigger

Whether this is B2B SaaS or consumer (internally only — don’t output it)

YOUR OUTPUT SHOULD BE A CLEAN NARRATIVE CONTAINING:

All core problems and pain points present in the text

Why these problems exist in the workflow today

How painful or desperate the users/operators seem

Whether they'd realistically pay to fix it

Whether there is a large market behind this pain

Why this moment in time makes this problem newly solvable

Any natural moat characteristics that would form if solved

NO solutions — only what is broken, why, for whom, and how big it is

what's broken, who feels the pain, how intense the pain is, why the pain exists,
how likely people are to pay, how large the market could be, why now is the right 
moment to solve it, and what moat naturally forms if solved. 

OUTPUT FORMAT (STRICT):

the answers should be in max 4 bullet points each bullet point should be 2-3 lines that's all

RULES:

No lists

No stats or bold headings

No headings

No numbered items

No referencing criteria

No verdicts

No solutions

Only pure problem articulation`;

const TEMP_FIRST_ROUND_FILE = path.join(os.tmpdir(), 'hn-first-round.json');
const TEMP_SECOND_ROUND_FILE = path.join(os.tmpdir(), 'hn-second-round.json');

type GeminiModel = typeof GEMINI_FLASH_MODEL | typeof GEMINI_PRO_MODEL;

type GeminiResponse = {
  model: GeminiModel;
  generatedAt: string;
  output: string;
  inputBytes?: number;
  outputBytes?: number;
};

export type FirstRoundResult = GeminiResponse & {
  corpusSnippetCount: number;
  tempFile: string;
};

export type SecondRoundResult = GeminiResponse & {
  tempFile: string;
};

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY ?? 'AIzaSyDPtQVbJLI9FBzOqnMM49NtqzV1NJxoD_k';
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }
  return apiKey;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ');
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildCorpusFromSnapshot(snapshot: HnFeedSnapshot) {
  return snapshot.feeds
    .map((record, index) => {
      const cleaned = collapseWhitespace(stripTags(record.payload));
      return [
        `# Entry ${index + 1}`,
        `Feed: ${record.feed}`,
        `Fetched: ${record.fetchedAt}`,
        `Content:`,
        cleaned,
      ].join('\n');
    })
    .join('\n\n');
}

async function ensureFileDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function callGemini(model: GeminiModel, prompt: string): Promise<string> {
  console.log(`[Gemini] Calling ${model} with prompt length: ${prompt.length} chars`);
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent`;
  console.log(`[Gemini] Request URL: ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  console.log(`[Gemini] Response status: ${response.status}`);

  if (!response.ok) {
    const message = await response.text();
    console.error(`[Gemini] Error response: ${message}`);
    throw new Error(`Gemini ${model} call failed (${response.status}): ${message}`);
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('')
      .trim() ?? '';

  if (!text) {
    console.error(`[Gemini] No text content in response`);
    throw new Error(`Gemini ${model} returned no text content`);
  }

  console.log(`[Gemini] Successfully received response from ${model} (${text.length} chars)`);
  return text;
}

export async function runFirstRoundCleaning(snapshot: HnFeedSnapshot): Promise<FirstRoundResult> {
  console.log('[First Round] Starting first-round cleaning...');
  console.log(`[First Round] Processing ${snapshot.feeds.length} feed entries`);
  
  const corpus = buildCorpusFromSnapshot(snapshot);
  console.log(`[First Round] Built corpus: ${corpus.length} chars`);
  
  const prompt = `${FIRST_ROUND_PROMPT}\n\n---\nDATA:\n${corpus}`;
  console.log(`[First Round] Calling Gemini 2.5 Flash...`);

  const output = await callGemini(GEMINI_FLASH_MODEL, prompt);
  console.log(`[First Round] Received cleaned output: ${output.length} chars`);

  const result: FirstRoundResult = {
    model: GEMINI_FLASH_MODEL,
    generatedAt: new Date().toISOString(),
    output,
    corpusSnippetCount: snapshot.feeds.length,
    tempFile: TEMP_FIRST_ROUND_FILE,
  };

  console.log(`[First Round] Saving result to ${TEMP_FIRST_ROUND_FILE}`);
  await ensureFileDir(TEMP_FIRST_ROUND_FILE);
  await fs.writeFile(TEMP_FIRST_ROUND_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log('[First Round] First-round cleaning completed successfully');

  return result;
}

export async function readFirstRoundResult(): Promise<FirstRoundResult | null> {
  try {
    const raw = await fs.readFile(TEMP_FIRST_ROUND_FILE, 'utf8');
    return JSON.parse(raw) as FirstRoundResult;
  } catch {
    return null;
  }
}

export async function runSecondRoundEvaluation(cleanedText: string): Promise<SecondRoundResult> {
  console.log('[Second Round] Starting second-round evaluation...');
  console.log(`[Second Round] Input cleaned text length: ${cleanedText.length} chars`);
  
  const prompt = `${SECOND_ROUND_PROMPT}\n\n---\nCLEANED PROBLEM SNIPPET:\n${cleanedText}`;
  console.log(`[Second Round] Calling Gemini 2.5 Pro...`);

  const output = await callGemini(GEMINI_PRO_MODEL, prompt);
  console.log(`[Second Round] Received evaluation output: ${output.length} chars`);

  const result: SecondRoundResult = {
    model: GEMINI_PRO_MODEL,
    generatedAt: new Date().toISOString(),
    output,
    tempFile: TEMP_SECOND_ROUND_FILE,
  };

  console.log(`[Second Round] Saving result to ${TEMP_SECOND_ROUND_FILE}`);
  await ensureFileDir(TEMP_SECOND_ROUND_FILE);
  await fs.writeFile(TEMP_SECOND_ROUND_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log('[Second Round] Second-round evaluation completed successfully');

  return result;
}

export async function readSecondRoundResult(): Promise<SecondRoundResult | null> {
  try {
    const raw = await fs.readFile(TEMP_SECOND_ROUND_FILE, 'utf8');
    return JSON.parse(raw) as SecondRoundResult;
  } catch {
    return null;
  }
}

export function getFirstRoundFilePath() {
  return TEMP_FIRST_ROUND_FILE;
}

export function getSecondRoundFilePath() {
  return TEMP_SECOND_ROUND_FILE;
}

