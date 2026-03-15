import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
};

vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}));

import { createSpinner, withSpinner } from '../src/utils/spinner.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSpinner', () => {
  it('returns an ora spinner instance', () => {
    const s = createSpinner('loading…');
    expect(s).toBe(mockSpinner);
  });
});

describe('withSpinner', () => {
  it('calls succeed on success', async () => {
    const result = await withSpinner('doing…', async () => 42, 'done!');
    expect(result).toBe(42);
    expect(mockSpinner.succeed).toHaveBeenCalledWith('done!');
  });

  it('uses the text as success label when successText is omitted', async () => {
    await withSpinner('doing…', async () => 'value');
    expect(mockSpinner.succeed).toHaveBeenCalledWith('doing…');
  });

  it('calls fail and rethrows on error', async () => {
    const err = new Error('boom');
    await expect(withSpinner('doing…', async () => { throw err; })).rejects.toThrow('boom');
    expect(mockSpinner.fail).toHaveBeenCalledWith('doing…');
  });
});
