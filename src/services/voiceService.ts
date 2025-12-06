interface VoiceConfig {
  secretKey: string;
  connectionKey: string;
  defaultVoiceId: string;
}

interface SpeechSynthesisResult {
  audioData: string; // Base64 encoded audio
  success: boolean;
  error?: string;
}

interface VoiceProcessingResult {
  transcript: string;
  confidence: number;
  success: boolean;
  error?: string;
}

class VoiceService {
  private config: VoiceConfig;
  private baseUrl = 'https://api.picaos.com/v1/passthrough';

  constructor() {
    this.config = {
      secretKey: import.meta.env.VITE_PICA_SECRET_KEY || '',
      connectionKey: import.meta.env.VITE_PICA_ELEVENLABS_CONNECTION_KEY || '',
      defaultVoiceId: import.meta.env.VITE_ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
    };
  }

  /**
   * Convert text to speech using ElevenLabs
   */
  async synthesizeSpeech(
    text: string, 
    voiceId?: string,
    options?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      useSpeakerBoost?: boolean;
    }
  ): Promise<SpeechSynthesisResult> {
    if (!this.config.secretKey || !this.config.connectionKey) {
      return {
        audioData: '',
        success: false,
        error: 'ElevenLabs configuration missing'
      };
    }

    try {
      const voice = voiceId || this.config.defaultVoiceId;
      
      const response = await fetch(`${this.baseUrl}/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pica-secret': this.config.secretKey,
          'x-pica-connection-key': this.config.connectionKey,
          'x-pica-action-id': 'conn_mod_def::GCccCs7_t7Q::QpqEyuj2S4W481S8S1asbA'
        },
        body: JSON.stringify({
          text: text.slice(0, 1000), // Limit text length
          voice_id: voice,
          voice_settings: {
            stability: options?.stability ?? 0.5,
            similarity_boost: options?.similarityBoost ?? 0.75,
            style: options?.style ?? 0.2,
            use_speaker_boost: options?.useSpeakerBoost ?? true
          },
          apply_text_normalization: 'auto'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          audioData: '',
          success: false,
          error: `ElevenLabs API error: ${response.status} - ${errorText}`
        };
      }

      const result = await response.json();
      
      return {
        audioData: result.audio,
        success: true
      };

    } catch (error) {
      console.error('Speech synthesis failed:', error);
      return {
        audioData: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Enhanced voice input processing using Web Speech API
   */
  async processVoiceInput(audioBlob: Blob): Promise<VoiceProcessingResult> {
    try {
      // First try Web Speech API if available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const result = await this.processWithWebSpeechAPI(audioBlob);
        if (result.success) {
          return result;
        }
      }

      // Fallback to basic transcription
      return {
        transcript: 'Voice input received but transcription unavailable',
        confidence: 0.3,
        success: false,
        error: 'Speech recognition not available'
      };

    } catch (error) {
      console.error('Voice processing failed:', error);
      return {
        transcript: '',
        confidence: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process voice input using Web Speech API
   */
  private async processWithWebSpeechAPI(audioBlob: Blob): Promise<VoiceProcessingResult> {
    return new Promise((resolve) => {
      try {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          const result = event.results[0];
          const transcript = result[0].transcript;
          const confidence = result[0].confidence;
          
          resolve({
            transcript,
            confidence,
            success: true
          });
        };

        recognition.onerror = (event: any) => {
          resolve({
            transcript: '',
            confidence: 0,
            success: false,
            error: `Speech recognition error: ${event.error}`
          });
        };

        recognition.onend = () => {
          // Recognition ended without result
          setTimeout(() => {
            resolve({
              transcript: '',
              confidence: 0,
              success: false,
              error: 'No speech detected'
            });
          }, 100);
        };

        // Convert blob to audio for recognition
        const audio = new Audio();
        audio.src = URL.createObjectURL(audioBlob);
        audio.load();
        
        recognition.start();

      } catch (error) {
        resolve({
          transcript: '',
          confidence: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Web Speech API error'
        });
      }
    });
  }

  /**
   * Play synthesized audio
   */
  async playAudio(base64Audio: string): Promise<boolean> {
    try {
      // Convert base64 to audio blob
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        uint8Array[i] = audioData.charCodeAt(i);
      }
      
      const audioBlob = new Blob([uint8Array], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve(true);
        };
        
        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };
        
        audio.play().catch(reject);
      });

    } catch (error) {
      console.error('Audio playback failed:', error);
      return false;
    }
  }

  /**
   * Get available voice options
   */
  getVoiceOptions() {
    return {
      defaultVoice: this.config.defaultVoiceId,
      voices: [
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Default)', accent: 'American' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', accent: 'American' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', accent: 'American' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American' },
        { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', accent: 'American' }
      ]
    };
  }

  /**
   * Test voice synthesis with a sample phrase
   */
  async testVoiceSynthesis(): Promise<boolean> {
    const testPhrase = "Hello! I'm your AI architectural assistant. I can help you design and refine your architectural projects.";
    
    try {
      const result = await this.synthesizeSpeech(testPhrase);
      
      if (result.success && result.audioData) {
        console.log('Voice synthesis test successful');
        return true;
      } else {
        console.warn('Voice synthesis test failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Voice synthesis test error:', error);
      return false;
    }
  }

  /**
   * Create a voice-enhanced response for design feedback
   */
  async createVoiceResponse(text: string, playAudio = true): Promise<{
    text: string;
    audioData?: string;
    played: boolean;
  }> {
    try {
      const synthesis = await this.synthesizeSpeech(text);
      
      const result = {
        text,
        audioData: synthesis.success ? synthesis.audioData : undefined,
        played: false
      };

      // Optionally play the audio immediately
      if (playAudio && synthesis.success && synthesis.audioData) {
        try {
          await this.playAudio(synthesis.audioData);
          result.played = true;
        } catch (playError) {
          console.warn('Audio playback failed:', playError);
        }
      }

      return result;
    } catch (error) {
      console.error('Voice response creation failed:', error);
      return {
        text,
        played: false
      };
    }
  }

  /**
   * Check if voice features are available
   */
  isVoiceAvailable(): {
    synthesis: boolean;
    recognition: boolean;
    enhanced: boolean;
  } {
    return {
      synthesis: !!(this.config.secretKey && this.config.connectionKey),
      recognition: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
      enhanced: !!(this.config.secretKey && this.config.connectionKey) && 
                ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    };
  }
}

// Export singleton instance
export const voiceService = new VoiceService();
export type { VoiceProcessingResult, SpeechSynthesisResult }; 