import { mapTemplateSetsToWorkoutSetCreates } from './template-copy.utils';

describe('mapTemplateSetsToWorkoutSetCreates', () => {
  const templateSets = [
    { type: 'warmup', reps: 10, weight: 60, duration: null, notes: null },
    { type: 'normal', reps: 5, weight: 100, duration: null, notes: 'belt on' },
    { type: 'normal', reps: null, weight: null, duration: 30, notes: null },
  ];

  it('renumbers sets 1..n and copies type and notes', () => {
    const result = mapTemplateSetsToWorkoutSetCreates(templateSets);

    expect(result.map((set) => set.setNumber)).toEqual([1, 2, 3]);
    expect(result.map((set) => set.type)).toEqual([
      'warmup',
      'normal',
      'normal',
    ]);
    expect(result[1].notes).toBe('belt on');
  });

  it('carries target values as suggestions, never as actuals', () => {
    const result = mapTemplateSetsToWorkoutSetCreates(templateSets);

    expect(result[0]).toEqual({
      setNumber: 1,
      type: 'warmup',
      notes: null,
      completed: false,
      suggestedReps: 10,
      suggestedWeight: 60,
      suggestedDuration: null,
    });
    expect(result[2].suggestedDuration).toBe(30);
    for (const set of result) {
      expect(set).not.toHaveProperty('reps');
      expect(set).not.toHaveProperty('weight');
      expect(set).not.toHaveProperty('duration');
      expect(set.completed).toBe(false);
    }
  });

  it('maps an empty template exercise to no sets', () => {
    expect(mapTemplateSetsToWorkoutSetCreates([])).toEqual([]);
  });
});
