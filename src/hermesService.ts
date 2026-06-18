export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: {
    content: string;
  };
}

// Connexion directe à ton Ollama local (le port 11434 est ouvert chez toi)
const OLLAMA_URL = 'http://localhost:11434/api/chat';

export const queryHermes = async (messages: HermesMessage[]): Promise<string> => {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        model: 'gemma4', // Ajuste le nom si ton modèle s'appelle différemment dans Ollama
        messages: messages,
        stream: false 
      }),
    });

    if (!response.ok) throw new Error(`Erreur Ollama: ${response.status}`);
    
    const data: OllamaResponse = await response.json();
    return data.message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre Ollama. Assure-toi que l\'application Ollama tourne bien en arrière-plan.');
  }
};