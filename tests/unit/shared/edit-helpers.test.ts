import { describe, it, expect } from 'vitest';
import {
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  LEFT_DOUBLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
  normalizeQuotes,
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
} from '../../../src/shared/edit-helpers.js';

// ---------------------------------------------------------------------------
// normalizeQuotes
// ---------------------------------------------------------------------------

describe('normalizeQuotes', () => {
  it('converts curly single and double quotes to straight equivalents', () => {
    const input = `${LEFT_DOUBLE_CURLY_QUOTE}Hello${RIGHT_DOUBLE_CURLY_QUOTE} ${LEFT_SINGLE_CURLY_QUOTE}world${RIGHT_SINGLE_CURLY_QUOTE}`;
    expect(normalizeQuotes(input)).toBe('"Hello" \'world\'');
  });

  it('leaves straight quotes unchanged', () => {
    const input = '"straight doubles" and \'straight singles\'';
    expect(normalizeQuotes(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// findActualString
// ---------------------------------------------------------------------------

describe('findActualString', () => {
  it('returns the search string on exact match', () => {
    const file = 'function greet() { return "hello"; }';
    const search = 'return "hello"';
    expect(findActualString(file, search)).toBe(search);
  });

  it('falls back to quote-normalized matching and returns the original substring', () => {
    const file = `She said ${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const search = 'She said "hello"';
    const result = findActualString(file, search);
    // The returned string should be from the original file (curly quotes)
    expect(result).toBe(file);
  });

  it('returns null when the string is not found at all', () => {
    const file = 'nothing here';
    expect(findActualString(file, 'missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// preserveQuoteStyle
// ---------------------------------------------------------------------------

describe('preserveQuoteStyle', () => {
  it('returns newString unchanged when no normalization happened', () => {
    const result = preserveQuoteStyle('same', 'same', 'replacement');
    expect(result).toBe('replacement');
  });

  it('applies curly double quotes to newString when file used them', () => {
    const oldString = '"hello"';
    const actualOldString = `${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '"goodbye"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toBe(
      `${LEFT_DOUBLE_CURLY_QUOTE}goodbye${RIGHT_DOUBLE_CURLY_QUOTE}`,
    );
  });

  it('handles contractions by using right single curly for apostrophes', () => {
    const oldString = "don't";
    const actualOldString = `don${RIGHT_SINGLE_CURLY_QUOTE}t`;
    const newString = "won't";

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toBe(`won${RIGHT_SINGLE_CURLY_QUOTE}t`);
  });
});

// ---------------------------------------------------------------------------
// applyEditToFile
// ---------------------------------------------------------------------------

describe('applyEditToFile', () => {
  it('replaces the first occurrence by default', () => {
    const original = 'aaa bbb aaa';
    const result = applyEditToFile(original, 'aaa', 'ccc');
    expect(result).toBe('ccc bbb aaa');
  });

  it('replaces all occurrences when replaceAll is true', () => {
    const original = 'aaa bbb aaa';
    const result = applyEditToFile(original, 'aaa', 'ccc', true);
    expect(result).toBe('ccc bbb ccc');
  });

  it('strips trailing newline when deleting a string followed by newline', () => {
    const original = 'line1\nline2\nline3\n';
    // Deleting "line2" -- since "line2" does not end with \n but is followed
    // by \n in the file, the function should also strip that trailing newline.
    const result = applyEditToFile(original, 'line2', '');
    expect(result).toBe('line1\nline3\n');
  });

  it('deletes without stripping newline when oldString already ends with \\n', () => {
    const original = 'line1\nline2\nline3\n';
    const result = applyEditToFile(original, 'line2\n', '');
    expect(result).toBe('line1\nline3\n');
  });

  it('deletes with replaceAll=true and strips trailing newlines', () => {
    const original = 'aaa\nbbb\naaa\nccc\n';
    const result = applyEditToFile(original, 'aaa', '', true);
    expect(result).toBe('bbb\nccc\n');
  });
});

// ---------------------------------------------------------------------------
// preserveQuoteStyle — edge cases
// ---------------------------------------------------------------------------

describe('preserveQuoteStyle edge cases', () => {
  it('returns newString when actualOldString differs but has no curly quotes', () => {
    // actualOldString differs from oldString but has no curly quotes
    // This path is hit when normalization found a match but no curly quotes existed
    const result = preserveQuoteStyle('abc', 'xyz', 'replacement');
    expect(result).toBe('replacement');
  });

  it('applies curly single quotes to newString', () => {
    const oldString = "'hello'";
    const actualOldString = `${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE}`;
    const newString = "'goodbye'";

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_SINGLE_CURLY_QUOTE);
    expect(result).toContain(RIGHT_SINGLE_CURLY_QUOTE);
    expect(result).toContain('goodbye');
  });

  it('applies both curly single and double quotes when both present', () => {
    const oldString = `"he said 'hi'"`;
    const actualOldString = `${LEFT_DOUBLE_CURLY_QUOTE}he said ${LEFT_SINGLE_CURLY_QUOTE}hi${RIGHT_SINGLE_CURLY_QUOTE}${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = `"she said 'bye'"`;

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
    expect(result).toContain(RIGHT_DOUBLE_CURLY_QUOTE);
  });
});

// ---------------------------------------------------------------------------
// isOpeningContext — edge cases for curly quote application
// ---------------------------------------------------------------------------

describe('curly quote application edge cases', () => {
  it('treats quote after opening punctuation as opening', () => {
    const oldString = '("hello")';
    const actualOldString = `(${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE})`;
    const newString = '("world")';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    // The ( should trigger opening context for the quote
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
    expect(result).toContain('world');
  });

  it('treats quote after em dash as opening', () => {
    const oldString = '\u2014"hello"';
    const actualOldString = `\u2014${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '\u2014"world"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
  });

  it('treats quote after en dash as opening', () => {
    const oldString = '\u2013"hello"';
    const actualOldString = `\u2013${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '\u2013"world"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
  });

  it('treats quote after tab as opening', () => {
    const oldString = '\t"hello"';
    const actualOldString = `\t${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '\t"world"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
  });

  it('treats quote after newline as opening', () => {
    const oldString = '\n"hello"';
    const actualOldString = `\n${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '\n"world"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
  });

  it('treats quote after carriage return as opening', () => {
    const oldString = '\r"hello"';
    const actualOldString = `\r${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '\r"world"';

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
  });

  it('treats single quote after [ as opening', () => {
    const oldString = "['hello']";
    const actualOldString = `[${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE}]`;
    const newString = "['world']";

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_SINGLE_CURLY_QUOTE);
  });

  it('treats single quote after { as opening', () => {
    const oldString = "{'hello'}";
    const actualOldString = `{${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE}}`;
    const newString = "{'world'}";

    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_SINGLE_CURLY_QUOTE);
  });
});
