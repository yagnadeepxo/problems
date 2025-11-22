import Link from "next/link";
import { Suspense } from "react";

import { supabase, type HnEvaluation } from "@/app/lib/supabase";

async function getEvaluationsByDay() {
  try {
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
        evaluations: evaluations.map((e) => ({
          id: e.id,
          created_at: e.created_at,
        })),
      }))
      .sort((a, b) => b.day.localeCompare(a.day)); // Sort newest first

    return days;
  } catch (error) {
    console.error('Failed to fetch evaluations:', error);
    return [];
  }
}

async function getEvaluationById(id: string): Promise<HnEvaluation | null> {
  try {
    const { data, error } = await supabase
      .from('hn_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to fetch evaluation:', error);
    return null;
  }
}

function DayList({ days, selectedId }: { 
  days: Array<{ day: string; evaluations: Array<{ id: string; created_at: string }> }>; 
  selectedId?: string 
}) {
  if (days.length === 0) {
    return (
      <div className="text-orange-500">
        <p>No evaluations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ day, evaluations }) => {
        const date = new Date(day);
        const formattedDate = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        const isSelected = evaluations.some(e => e.id === selectedId);

        return (
          <Link
            key={day}
            href={`/?id=${evaluations[0].id}`}
            className={`block text-orange-500 hover:text-orange-400 transition ${
              isSelected ? 'text-orange-400' : ''
            }`}
          >
            {formattedDate}
          </Link>
        );
      })}
    </div>
  );
}

function EvaluationDetail({ evaluation }: { evaluation: HnEvaluation }) {
  const date = new Date(evaluation.created_at);
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-block text-orange-500 hover:text-orange-400 transition"
      >
        ← Back
      </Link>
      <div>
        <h2 className="text-2xl font-semibold text-orange-500 mb-4">{formattedDate}</h2>
        <pre className="whitespace-pre-wrap text-orange-500 font-mono text-sm leading-relaxed">
          {evaluation.evaluation_output}
        </pre>
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const selectedId = params.id;

  const [days, selectedEvaluation] = await Promise.all([
    getEvaluationsByDay(),
    selectedId ? getEvaluationById(selectedId) : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen bg-black p-8 font-mono">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-orange-500 mb-12 font-mono">potential problems</h1>
        
        {selectedEvaluation ? (
          <Suspense fallback={<div className="text-orange-500">Loading...</div>}>
            <EvaluationDetail evaluation={selectedEvaluation} />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="text-orange-500">Loading...</div>}>
            <DayList days={days} selectedId={selectedId} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
