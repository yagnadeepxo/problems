import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const CORE_FEEDS = [
  'https://hnrss.org/ask?comments=10',
  'https://hnrss.org/show?points=50',
  'https://hnrss.org/newest?points=50',
  'https://hnrss.org/bestcomments',
];

const TEMP_FILE_NAME = 'hn-core-feeds.json';
const TEMP_FILE_PATH = path.join(os.tmpdir(), TEMP_FILE_NAME);

export type HnFeedRecord = {
  feed: string;
  fetchedAt: string;
  payload: string;
};

export type HnFeedSnapshot = {
  generatedAt: string;
  feeds: HnFeedRecord[];
};

async function ensureTempFileDir() {
  const dir = path.dirname(TEMP_FILE_PATH);
  await fs.mkdir(dir, { recursive: true });
}

export async function refreshHnFeeds(): Promise<HnFeedSnapshot> {
  console.log('[HN Feeds] Starting to fetch HN feeds...');
  const feeds: HnFeedRecord[] = [];

  for (const feed of CORE_FEEDS) {
    console.log(`[HN Feeds] Fetching: ${feed}`);
    const response = await fetch(feed, {
      headers: {
        'user-agent': 'problems-app/hn-aggregator (https://github.com/vercel/next.js)',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[HN Feeds] Failed to fetch ${feed}: ${response.status}`);
      throw new Error(`Failed to fetch ${feed} (${response.status})`);
    }

    const payload = await response.text();
    console.log(`[HN Feeds] Successfully fetched ${feed} (${payload.length} chars)`);
    feeds.push({
      feed,
      fetchedAt: new Date().toISOString(),
      payload,
    });
  }

  const snapshot: HnFeedSnapshot = {
    generatedAt: new Date().toISOString(),
    feeds,
  };

  console.log(`[HN Feeds] Fetched ${feeds.length} feeds, saving to ${TEMP_FILE_PATH}`);
  await ensureTempFileDir();
  await fs.writeFile(TEMP_FILE_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('[HN Feeds] Snapshot saved successfully');

  return snapshot;
}

export async function readHnFeeds(): Promise<HnFeedSnapshot | null> {
  try {
    const content = await fs.readFile(TEMP_FILE_PATH, 'utf8');
    return JSON.parse(content) as HnFeedSnapshot;
  } catch (error) {
    return null;
  }
}

export function getTempFilePath() {
  return TEMP_FILE_PATH;
}

