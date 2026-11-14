import { describe, expect, it } from 'vitest';
import { APP_NAME, TRAINING_DISCLAIMER } from '../src/app-info';

describe('app info', () => {
  it('names the app and carries the training disclaimer', () => {
    expect(APP_NAME).toBe('IFRSim');
    expect(TRAINING_DISCLAIMER).toMatch(/not for navigation/i);
  });
});
