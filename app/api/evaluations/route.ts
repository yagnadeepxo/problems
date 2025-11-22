import { NextRequest } from 'next/server';

import { supabase, type HnEvaluation } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/evaluations - Get all evaluations grouped by day
// GET /api/evaluations?id=xxx - Get specific evaluation by ID
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  try {
    if (id) {
      // Get specific evaluation by ID
      const { data, error } = await supabase
        .from('hn_evaluations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        return Response.json({ error: 'Evaluation not found' }, { status: 404 });
      }

      return Response.json({ evaluation: data });
    }

    // Get all evaluations, ordered by date (newest first)
    const { data, error } = await supabase
      .from('hn_evaluations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Group evaluations by day (YYYY-MM-DD)
    const groupedByDay: Record<string, HnEvaluation[]> = {};

    data?.forEach((evaluation) => {
      const date = new Date(evaluation.created_at);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!groupedByDay[dayKey]) {
        groupedByDay[dayKey] = [];
      }
      groupedByDay[dayKey].push(evaluation);
    });

    // Convert to array format with day as key
    const days = Object.entries(groupedByDay)
      .map(([day, evaluations]) => ({
        day,
        count: evaluations.length,
        evaluations: evaluations.map((e) => ({
          id: e.id,
          created_at: e.created_at,
          generated_at: e.generated_at,
          model: e.model,
        })),
      }))
      .sort((a, b) => b.day.localeCompare(a.day)); // Sort newest first

    return Response.json({ days });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

