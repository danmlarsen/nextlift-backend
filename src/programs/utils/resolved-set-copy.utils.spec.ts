import { ResolvedSet } from '../engine/types';
import { mapResolvedSetsToWorkoutSetCreates } from './resolved-set-copy.utils';

describe('mapResolvedSetsToWorkoutSetCreates', () => {
  const sets: ResolvedSet[] = [
    {
      programSetId: 11,
      setOrder: 1,
      type: 'warmup',
      repsMin: 5,
      repsMax: 5,
      isAmrap: false,
      targetRpe: null,
      restSeconds: 60,
      duration: null,
      weight: 40,
      percent: 50,
      basis: 'WORKING_WEIGHT',
      notes: null,
    },
    {
      programSetId: 12,
      setOrder: 2,
      type: 'normal',
      repsMin: 8,
      repsMax: 12,
      isAmrap: true,
      targetRpe: 8,
      restSeconds: 120,
      duration: null,
      weight: null,
      percent: null,
      basis: 'WORKING_WEIGHT',
      notes: 'pause at the bottom',
    },
  ];

  it('renumbers sets and carries prescriptions as suggestions only', () => {
    const result = mapResolvedSetsToWorkoutSetCreates(sets);
    expect(result).toEqual([
      {
        setNumber: 1,
        type: 'warmup',
        notes: null,
        completed: false,
        programSetId: 11,
        suggestedReps: 5,
        suggestedRepsMax: 5,
        suggestedWeight: 40,
        suggestedDuration: null,
        suggestedRpe: null,
        suggestedRestSeconds: 60,
        suggestedAmrap: false,
      },
      {
        setNumber: 2,
        type: 'normal',
        notes: 'pause at the bottom',
        completed: false,
        programSetId: 12,
        suggestedReps: 8,
        suggestedRepsMax: 12,
        suggestedWeight: null,
        suggestedDuration: null,
        suggestedRpe: 8,
        suggestedRestSeconds: 120,
        suggestedAmrap: true,
      },
    ]);
    for (const set of result) {
      expect(set).not.toHaveProperty('reps');
      expect(set).not.toHaveProperty('weight');
      expect(set).not.toHaveProperty('rpe');
    }
  });

  it('maps no sets to no creates', () => {
    expect(mapResolvedSetsToWorkoutSetCreates([])).toEqual([]);
  });
});
