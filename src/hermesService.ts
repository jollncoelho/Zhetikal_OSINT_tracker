const HERMES_GATEWAY_URL = 'http://localhost:62938/v1';

export const queryHermes = async (messages: { role: string; content: string }[]): Promise<string> => {
  try {
    const response = await fetch(HERMES_GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'stepfun/step-3.7-flash:free',
        messages,
        stream: true,
      }),
      // ─── nécessaire car certificat local auto-signé ───
      // @ts-ignore Node 18+ only
      rejectUnauthorized: false,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erreur Gateway: ${response.status} — ${text.slice(0, 200)}`);
    }

    // ─── lecture du flux SSE ───
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Réponse sans body');

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      // format: data: {"choices":[{"delta":{"content":"..."}}]}
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const parsed = JSON.parse(payload);
          fullText += parsed.choices?.[0]?.delta?.content ?? '';
        } catch { /* ignore malformed chunk */ }
      }
    }

    return fullText.trim();
  } catch (error) {
    console.error('[Hermes Gateway]', error);
    throw new Error(
      "Impossible de joindre Hermes Gateway sur https://localhost:8081/api. " +
      "Vérifie que Hermes Desktop est lancé et que la Local Gateway est active."
    );
  }
};