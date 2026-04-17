// Note: the directory is still named "middleware/context-compaction"
// for historical reasons. Since v1.3.0 this module exports a pure
// function (`compactMessages`) instead of a Vercel AI SDK middleware
// — middleware can't persist compacted state back to the caller, so
// re-compacting on every turn was unavoidable. The function form
// returns the new messages array and the caller assigns it back.
export {
  compactMessages,
  type CompactMessagesOptions,
  type CompactSummarizer,
} from './compact-messages.js';
