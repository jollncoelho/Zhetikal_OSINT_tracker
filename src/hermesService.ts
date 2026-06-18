export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface HermesResponse {
  message: {
    content: string;
  };
}

// Proxy Hermes Desktop local
const HERMES_URL = 'http://localhost:62938/api/chat';

export const queryHermes = async (messages: HermesMessage[], cwd?: string): Promise<string> => {
  try {
    const body: Record<string, unknown> = {
      model: 'gemma4',
      messages,
      stream: false,
    };

    if (cwd) {
      body.cwd = cwd;
    }

    const response = await fetch(HERMES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Erreur Hermes Core: ${response.status}`);

    const data: HermesResponse = await response.json();
    return data.message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre Hermes Core. Assure-toi que Hermes Desktop tourne bien en arrière-plan (port 62938).');
  }
};