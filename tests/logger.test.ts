import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../src/utils/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEBUG;
});

describe('logger', () => {
  it('info logs to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('success logs to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.success('done');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('warn logs to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.warn('careful');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('error logs to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('oops');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('debug does nothing when DEBUG is not set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('secret');
    expect(spy).not.toHaveBeenCalled();
  });

  it('debug logs when DEBUG env var is set', () => {
    process.env.DEBUG = '1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('secret');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('line logs a separator', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.line();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('blank logs an empty line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.blank();
    expect(spy).toHaveBeenCalledOnce();
  });
});
