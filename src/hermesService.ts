export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface HermesGatewayResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string;
    };
  }>;
}

// L'URL de la passerelle locale par défaut de Hermes Desktop
// On remplace 127.0.0.1 par localhost
const HERMES_GATEWAY_URL = 'http://localhost:23406/v1';
export const queryHermes = async (messages: HermesMessage[]): Promise<string> => {
  try {
    const response = await fetch(`${HERMES_GATEWAY_URL}/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        model: 'stepfun/step-3.7-flash:free', 
        messages, 
        stream: false 
      }),
    });

    if (!response.ok) throw new Error(`Erreur Gateway: ${response.status}`);
    
    const data: HermesGatewayResponse = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre la passerelle Hermes Desktop. Vérifie que l\'application est bien ouverte.');
  }
};