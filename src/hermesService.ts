export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: {
    content: string;
  };
}

// On cible directement le port stable d'Ollama sur ton PC
const OLLAMA_URL = 'http://localhost:11434/api/chat';

export const queryHermes = async (messages: HermesMessage[]): Promise<string> => {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        model: 'gemma4', // Met ici le nom exact de ton modèle local (gemma4, etc.)
        messages: messages,
        stream: false 
      }),
    });

    if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);
    
    const data: OllamaResponse = await response.json();
    return data.message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre Ollama. Vérifie qu\'Ollama tourne bien en arrière-plan.');
  }
};