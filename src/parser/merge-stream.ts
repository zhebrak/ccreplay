export interface RawEntry {
  type: string;
  subtype?: string;
  uuid: string;
  parentUuid?: string | null;
  timestamp: string;
  sessionId?: string;
  slug?: string;
  message?: {
    role?: string;
    id?: string;
    model?: string;
    content?: unknown;
    stop_reason?: string | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  costUSD?: number;
  cost_usd?: number;
  total_cost_usd?: number;
  requestId?: string;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  compactMetadata?: {
    trigger?: string;
    preTokens?: number;
  };
  content?: string;
  level?: string;
  data?: {
    type?: string;
    message?: unknown;
    [key: string]: unknown;
  };
}

export interface MergedEntry {
  type: string;
  subtype?: string;
  uuid: string;
  timestamp: string;
  slug?: string;
  message?: RawEntry["message"];
  costUSD?: number;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  compactMetadata?: RawEntry["compactMetadata"];
  content?: string;
}

/**
 * Merge streaming JSONL entries: assistant messages with the same message.id
 * are streamed as separate entries, each with one content block.
 * We merge all content blocks into a single entry per message.id,
 * deduplicating tool_use blocks by their id (keeping the last version).
 */
export function mergeStreamingEntries(entries: RawEntry[]): MergedEntry[] {
  // First pass: collect all entries per assistant message.id, preserving order
  const assistantGroups = new Map<string, RawEntry[]>();

  for (const entry of entries) {
    if (entry.type === "assistant" && entry.message?.id) {
      const id = entry.message.id;
      if (!assistantGroups.has(id)) {
        assistantGroups.set(id, []);
      }
      assistantGroups.get(id)!.push(entry);
    }
  }

  // Merge content blocks for each message group
  const mergedAssistant = new Map<string, MergedEntry>();
  for (const [id, group] of assistantGroups) {
    const allBlocks: any[] = [];
    const seenToolIds = new Set<string>();
    let lastEntry = group[group.length - 1];

    // Collect unique content blocks from all entries
    for (const entry of group) {
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === "tool_use" && block.id) {
          // For tool_use, keep only latest version (may have partial input earlier)
          if (seenToolIds.has(block.id)) {
            const idx = allBlocks.findIndex((b: any) => b.type === "tool_use" && b.id === block.id);
            if (idx >= 0) allBlocks[idx] = block;
          } else {
            seenToolIds.add(block.id);
            allBlocks.push(block);
          }
        } else if (block.type === "text" && block.text?.trim()) {
          // Avoid duplicate text blocks
          const exists = allBlocks.some((b: any) => b.type === "text" && b.text === block.text);
          if (!exists) allBlocks.push(block);
        } else if (block.type === "thinking") {
          if (!allBlocks.some((b: any) => b.type === "thinking")) {
            allBlocks.push(block);
          }
        }
      }
    }

    const merged = toMerged(lastEntry);
    merged.message = {
      ...lastEntry.message,
      content: allBlocks,
    };
    // Use first entry's timestamp for ordering
    merged.timestamp = group[0].timestamp;
    mergedAssistant.set(id, merged);
  }

  // Second pass: emit entries in order
  const result: MergedEntry[] = [];
  const emittedIds = new Set<string>();

  for (const entry of entries) {
    // Skip noise
    if (entry.type === "progress" || entry.type === "file-history-snapshot" || entry.type === "queue-operation") {
      continue;
    }

    if (entry.type === "assistant" && entry.message?.id) {
      const msgId = entry.message.id;
      if (emittedIds.has(msgId)) continue;
      emittedIds.add(msgId);
      result.push(mergedAssistant.get(msgId)!);
    } else {
      result.push(toMerged(entry));
    }
  }

  return result;
}

function toMerged(e: RawEntry): MergedEntry {
  return {
    type: e.type,
    subtype: e.subtype,
    uuid: e.uuid,
    timestamp: e.timestamp,
    slug: e.slug,
    message: e.message,
    costUSD: e.costUSD ?? e.cost_usd ?? e.total_cost_usd,
    toolUseResult: e.toolUseResult,
    sourceToolAssistantUUID: e.sourceToolAssistantUUID,
    isSidechain: e.isSidechain,
    isMeta: e.isMeta,
    compactMetadata: e.compactMetadata,
    content: e.content,
  };
}
