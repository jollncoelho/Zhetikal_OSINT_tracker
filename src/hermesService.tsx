export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface OllamaChatResponse {
  message: { role: 'assistant'; content: string; };
}
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
export const queryHermes = async (messages: HermesMessage[]): Promise<string> => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes', messages, stream: false, options: { temperature: 0.5 } }),
    });
    if (!response.ok) throw new Error(`Erreur Ollama: ${response.status}`);
    const data: OllamaChatResponse = await response.json();
    return data.message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre le moteur IA local. Vérifie qu\'Ollama tourne bien.');
  }
};