export async function boundedResponseText(
  response: Response,
  limit = 2_000_000,
): Promise<string> {
  if (Number(response.headers.get("Content-Length")) > limit)
    throw Error("Response exceeds its size limit");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty response");
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw Error("Response exceeds its size limit");
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    await reader.cancel();
  }
}
