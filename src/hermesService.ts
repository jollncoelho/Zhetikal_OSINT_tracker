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

export const queryHermes = async (messages: HermesMessage[], workdir?: string): Promise<string> => {
  try {
    const effectiveMessages: HermesMessage[] = workdir
      ? [
          {
            role: 'system',
            content: `Tu travailles EXCLUSIVEMENT dans le répertoire suivant : ${workdir}\nN'accède à aucun autre répertoire. Toutes tes opérations sur le système de fichiers doivent rester dans ce dossier.`,
          },
          ...messages,
        ]
      : messages;

    const body: Record<string, unknown> = {
      model: 'gemma4',
      messages: effectiveMessages,
      stream: false,
    };

    if (workdir) {
      body.cwd = workdir;
    }

    console.log('Hermes request → workdir:', workdir, 'messages count:', effectiveMessages.length);

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
    const base = 'Impossible de joindre Hermes Core. Assure-toi que Hermes Desktop tourne bien en arrière-plan (port 62938).';
    const suffix = workdir ? ` — Vérifie que le dossier existe toujours : ${workdir}` : '';
    throw new Error(base + suffix);
  }
};
