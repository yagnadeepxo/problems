import { NextRequest } from 'next/server';

import { type HnFeedSnapshot, getTempFilePath, readHnFeeds, refreshHnFeeds } from '@/app/lib/hnFeeds';
import {
  readFirstRoundResult,
  readSecondRoundResult,
  runFirstRoundCleaning,
  runSecondRoundEvaluation,
} from '@/app/lib/geminiClient';
import { supabase } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shouldRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
  console.log(`[API] /api/hn called with refresh=${shouldRefresh}`);

  try {
    let snapshot: HnFeedSnapshot | null = null;
    let source: 'cache' | 'refreshed' = 'cache';

    if (shouldRefresh) {
      console.log('[API] Refresh requested, fetching new HN feeds...');
      snapshot = await refreshHnFeeds();
      source = 'refreshed';
    } else {
      console.log('[API] Reading cached HN feeds...');
      snapshot = await readHnFeeds();
      if (!snapshot) {
        console.log('[API] No cached snapshot found, fetching new feeds...');
        snapshot = await refreshHnFeeds();
        source = 'refreshed';
      } else {
        console.log('[API] Using cached snapshot');
      }
    }

    console.log('[API] Checking for existing first and second round results...');
    let firstRound = await readFirstRoundResult();
    let secondRound = await readSecondRoundResult();

    if (shouldRefresh || !firstRound) {
      console.log(`[API] Running first-round cleaning (refresh=${shouldRefresh}, hasFirstRound=${!!firstRound})`);
      if (!snapshot) {
        console.log('[API] No snapshot available, fetching...');
        snapshot = await refreshHnFeeds();
        source = 'refreshed';
      }
      firstRound = await runFirstRoundCleaning(snapshot);
    } else {
      console.log('[API] Using cached first-round result');
    }

    if (
      firstRound &&
      (shouldRefresh || !secondRound) &&
      firstRound.output.trim().length > 0
    ) {
      console.log(`[API] Running second-round evaluation (refresh=${shouldRefresh}, hasSecondRound=${!!secondRound}, firstRoundOutputLength=${firstRound.output.trim().length})`);
      secondRound = await runSecondRoundEvaluation(firstRound.output);

      // Save final evaluation to Supabase
      if (secondRound && secondRound.output.trim().length > 0) {
        console.log('[API] Saving evaluation to Supabase...');
        console.log(`[API] Evaluation details: model=${secondRound.model}, outputLength=${secondRound.output.length}, generatedAt=${secondRound.generatedAt}`);
        
        try {
          const { data, error } = await supabase.from('hn_evaluations').insert({
            evaluation_output: secondRound.output,
            model: secondRound.model,
            generated_at: secondRound.generatedAt,
          }).select();

          if (error) {
            console.error('[API] Supabase insert error:', error);
            console.error('[API] Error details:', JSON.stringify(error, null, 2));
          } else {
            console.log('[API] Successfully saved evaluation to Supabase');
            console.log('[API] Inserted record:', JSON.stringify(data, null, 2));
          }
        } catch (dbError) {
          console.error('[API] Exception while saving to Supabase:', dbError);
          if (dbError instanceof Error) {
            console.error('[API] Error message:', dbError.message);
            console.error('[API] Error stack:', dbError.stack);
          }
        }
      } else {
        console.log('[API] Skipping Supabase save: secondRound is empty or missing');
        if (!secondRound) {
          console.log('[API] secondRound is null');
        } else if (secondRound.output.trim().length === 0) {
          console.log('[API] secondRound output is empty');
        }
      }
    } else {
      if (!firstRound) {
        console.log('[API] Skipping second-round: no first-round result');
      } else if (firstRound.output.trim().length === 0) {
        console.log('[API] Skipping second-round: first-round output is empty');
      } else if (!shouldRefresh && secondRound) {
        console.log('[API] Using cached second-round result');
      }
    }

    console.log('[API] Pipeline completed, returning response');
    return Response.json({
      source,
      tempFile: getTempFilePath(),
      snapshot,
      firstRound,
      secondRound,
    });
  } catch (error) {
    console.error('[API] Pipeline error:', error);
    if (error instanceof Error) {
      console.error('[API] Error message:', error.message);
      console.error('[API] Error stack:', error.stack);
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

