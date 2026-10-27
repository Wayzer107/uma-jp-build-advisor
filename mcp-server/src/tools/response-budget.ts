export const MCP_REPLY_BUDGET = 900 * 1024;

export function replyBytes(data: unknown): number {
  const text = JSON.stringify(data);
  return Buffer.byteLength(JSON.stringify({ content: [{ type: "text", text }], structuredContent: data }));
}

/** Keep a contiguous prefix, using logarithmically many size checks. */
export function boundedPage<T, R>(items: readonly T[], response: (page: T[]) => R): R {
  const full = response([...items]);
  if (replyBytes(full) <= MCP_REPLY_BUDGET) return full;
  let best = response([]);
  if (replyBytes(best) > MCP_REPLY_BUDGET) throw new Error("The response metadata exceeds the safe MCP reply budget. Stored data is unchanged.");
  let low = 1;
  let high = items.length - 1;
  let fitted = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = response(items.slice(0, middle));
    if (replyBytes(candidate) <= MCP_REPLY_BUDGET) {
      best = candidate;
      fitted = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (items.length && !fitted) throw new Error("One record exceeds the safe MCP reply budget. Stored data is unchanged; ownership is not empty.");
  return best;
}
