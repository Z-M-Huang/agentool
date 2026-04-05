import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from '../../../src/shared/errors.js';

describe('extractErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('converts string to itself', () => {
    expect(extractErrorMessage('oops')).toBe('oops');
  });

  it('converts number to string', () => {
    expect(extractErrorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(extractErrorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(extractErrorMessage(undefined)).toBe('undefined');
  });

  it('converts object to string', () => {
    expect(extractErrorMessage({ code: 'ENOENT' })).toBe('[object Object]');
  });
});
