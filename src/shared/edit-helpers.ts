/** Unicode left single curly quote: \u2018 */
export const LEFT_SINGLE_CURLY_QUOTE = '\u2018';

/** Unicode right single curly quote: \u2019 */
export const RIGHT_SINGLE_CURLY_QUOTE = '\u2019';

/** Unicode left double curly quote: \u201C */
export const LEFT_DOUBLE_CURLY_QUOTE = '\u201C';

/** Unicode right double curly quote: \u201D */
export const RIGHT_DOUBLE_CURLY_QUOTE = '\u201D';

/**
 * Normalize curly (smart) quotes to their straight ASCII equivalents.
 *
 * Replaces left/right single curly quotes with `'` and left/right double
 * curly quotes with `"`.
 *
 * @param str - The string to normalize.
 * @returns A new string with all curly quotes replaced by straight quotes.
 */
export function normalizeQuotes(str: string): string {
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"');
}

/**
 * Locate a search string within file content, falling back to quote-normalized
 * matching when an exact match is not found.
 *
 * When the fallback matches, the *original* substring from `fileContent` is
 * returned (preserving the file's actual quote characters).
 *
 * @param fileContent   - The full file content to search within.
 * @param searchString  - The string to look for.
 * @returns The matching substring from `fileContent`, or `null` if not found.
 */
export function findActualString(
  fileContent: string,
  searchString: string,
): string | null {
  // Exact match -- fast path
  if (fileContent.includes(searchString)) {
    return searchString;
  }

  // Fallback: normalize both sides and search in the normalized file
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedFile = normalizeQuotes(fileContent);

  const searchIndex = normalizedFile.indexOf(normalizedSearch);
  if (searchIndex !== -1) {
    return fileContent.substring(
      searchIndex,
      searchIndex + searchString.length,
    );
  }

  return null;
}

/**
 * When `oldString` matched via quote normalization (curly quotes in the file,
 * straight quotes from the model), apply the same curly-quote style to
 * `newString` so the edit preserves the file's typography.
 *
 * If no normalization occurred (`oldString === actualOldString`), `newString`
 * is returned unchanged.
 *
 * @param oldString       - The search string as provided by the caller (straight quotes).
 * @param actualOldString - The string actually found in the file (may contain curly quotes).
 * @param newString       - The replacement string to style.
 * @returns `newString` with curly quotes applied where appropriate.
 */
export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  if (oldString === actualOldString) {
    return newString;
  }

  const hasDoubleQuotes =
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE);
  const hasSingleQuotes =
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE);

  if (!hasDoubleQuotes && !hasSingleQuotes) {
    return newString;
  }

  let result = newString;

  if (hasDoubleQuotes) {
    result = applyCurlyDoubleQuotes(result);
  }
  if (hasSingleQuotes) {
    result = applyCurlySingleQuotes(result);
  }

  return result;
}

/**
 * Apply a string replacement to file content.
 *
 * When `newString` is empty (deletion), the function also strips a trailing
 * newline that immediately follows `oldString` in `originalContent`, preventing
 * a leftover blank line.
 *
 * @param originalContent - The original file text.
 * @param oldString       - The substring to replace.
 * @param newString       - The replacement text.
 * @param replaceAll      - When `true`, replace every occurrence; otherwise
 *                          replace only the first.  Defaults to `false`.
 * @returns The updated file content.
 */
export function applyEditToFile(
  originalContent: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): string {
  const f = replaceAll
    ? (content: string, search: string, replace: string) =>
        content.replaceAll(search, () => replace)
    : (content: string, search: string, replace: string) =>
        content.replace(search, () => replace);

  if (newString !== '') {
    return f(originalContent, oldString, newString);
  }

  // Deletion: strip trailing newline when the old string does not already
  // end with one but is followed by one in the file.
  const stripTrailingNewline =
    !oldString.endsWith('\n') &&
    originalContent.includes(oldString + '\n');

  return stripTrailingNewline
    ? f(originalContent, oldString + '\n', newString)
    : f(originalContent, oldString, newString);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a character at `index` is in an "opening" context.
 *
 * A quote is considered opening when it appears at the start of the string
 * or is preceded by whitespace or opening punctuation.
 */
function isOpeningContext(chars: string[], index: number): boolean {
  if (index === 0) {
    return true;
  }
  const prev = chars[index - 1];
  return (
    prev === ' ' ||
    prev === '\t' ||
    prev === '\n' ||
    prev === '\r' ||
    prev === '(' ||
    prev === '[' ||
    prev === '{' ||
    prev === '\u2014' || // em dash
    prev === '\u2013'    // en dash
  );
}

/** Replace straight double quotes with curly doubles using open/close heuristic. */
function applyCurlyDoubleQuotes(str: string): string {
  const chars = [...str];
  const result: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      result.push(
        isOpeningContext(chars, i)
          ? LEFT_DOUBLE_CURLY_QUOTE
          : RIGHT_DOUBLE_CURLY_QUOTE,
      );
    } else {
      result.push(chars[i]!);
    }
  }
  return result.join('');
}

/** Replace straight single quotes with curly singles, preserving contractions. */
function applyCurlySingleQuotes(str: string): string {
  const chars = [...str];
  const result: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") {
      const prev = i > 0 ? chars[i - 1] : undefined;
      const next = i < chars.length - 1 ? chars[i + 1] : undefined;
      const prevIsLetter = prev !== undefined && /\p{L}/u.test(prev);
      const nextIsLetter = next !== undefined && /\p{L}/u.test(next);

      if (prevIsLetter && nextIsLetter) {
        // Apostrophe in a contraction -- use right single curly quote
        result.push(RIGHT_SINGLE_CURLY_QUOTE);
      } else {
        result.push(
          isOpeningContext(chars, i)
            ? LEFT_SINGLE_CURLY_QUOTE
            : RIGHT_SINGLE_CURLY_QUOTE,
        );
      }
    } else {
      result.push(chars[i]!);
    }
  }
  return result.join('');
}
