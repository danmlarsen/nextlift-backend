import { Prisma } from '@prisma/client';

type TemplateSetSource = {
  type: string;
  reps: number | null;
  weight: number | null;
  duration: number | null;
  notes: string | null;
};

/**
 * Maps a template exercise's sets to the create inputs for a fresh workout's
 * sets. The template's target values are carried as suggested* fields — they
 * surface as input placeholders and are adopted as the real values when a set
 * is completed untouched — never as pre-filled actuals.
 */
export function mapTemplateSetsToWorkoutSetCreates(
  templateSets: TemplateSetSource[],
): Prisma.WorkoutSetCreateWithoutWorkoutExerciseInput[] {
  return templateSets.map((templateSet, index) => ({
    setNumber: index + 1,
    type: templateSet.type,
    notes: templateSet.notes,
    completed: false,
    suggestedReps: templateSet.reps,
    suggestedWeight: templateSet.weight,
    suggestedDuration: templateSet.duration,
  }));
}
