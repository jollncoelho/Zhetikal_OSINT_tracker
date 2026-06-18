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

// L'URL officielle confirmée par Hermes
const HERMES_GATEWAY_URL = 'http://localhost:62938/v1';

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

    if (!response.ok) {
      throw new Error(`Erreur Gateway: ${response.status} (${response.statusText})`);
    }
    
    const data: HermesGatewayResponse = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre la passerelle Hermes Desktop. Vérifie que la Local Gateway est bien active.');
  }
};