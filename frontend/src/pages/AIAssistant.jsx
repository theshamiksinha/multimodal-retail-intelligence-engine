import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithAdvisor, clearAdvisorSession } from '../api';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_STT_API_KEY;
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID;

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm your AI Retail Advisor. I have access to your store's sales data, inventory status, and customer behaviour analytics. Ask me anything about your store!\n\nHere are some things I can help with:\n- Store layout and product placement recommendations\n- Sales trends and product performance analysis\n- Inventory management and expiry alerts\n- Marketing campaign suggestions",
      suggestions: [
        'Which products attract the most customer attention?',
        'Which areas of my store are being overlooked?',
        'Generate a campaign for my slowest-moving products',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(null); // index of message being loaded
  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Speech to Text ──────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone permissions.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];

        const response = await fetch(
          `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'en-US',
              },
              audio: { content: base64Audio },
            }),
          }
        );

        const data = await response.json();
        const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
        if (transcript) setInput(transcript);
        else alert('Could not understand audio. Please try again.');
      };
    } catch (err) {
      alert('Speech recognition failed. Check your Google API key.');
    }
  };

  const playTTS = async (text, index) => {
  if (currentAudioRef.current) {
    currentAudioRef.current.pause();
    currentAudioRef.current = null;
  }

  console.log('ElevenLabs key:', ELEVENLABS_API_KEY);
  console.log('Voice ID:', ELEVENLABS_VOICE_ID);

  setTtsLoading(index);
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    console.log('ElevenLabs status:', response.status);

    if (!response.ok) {
      const errData = await response.json();
      console.error('ElevenLabs full error:', JSON.stringify(errData, null, 2));
      console.error('Status code:', response.status);
      alert(`ElevenLabs Error ${response.status}: ${errData.detail?.message || JSON.stringify(errData)}`);
      return;
    }

    const audioBlob = await response.blob();
    console.log('Audio blob received:', audioBlob.size, 'bytes');
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();
  } catch (err) {
    console.error('TTS exception:', err);
    alert(`TTS failed: ${err.message}`);
  } finally {
    setTtsLoading(null);
  }
};

  // ── Chat ─────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await chatWithAdvisor(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.response,
          suggestions: res.data.suggestions || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please make sure the backend is running and your API keys are configured.',
        },
      ]);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    await clearAdvisorSession('default').catch(() => {});
    setMessages([messages[0]]);
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">Conversational AI Assistant</h2>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} />
          Clear Chat
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-indigo-600" />
              </div>
            )}
            <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-slate max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>

              {/* Speaker button for assistant messages */}
              {msg.role === 'assistant' && (
                <button
                  onClick={() => playTTS(msg.content, i)}
                  disabled={ttsLoading === i}
                  className="mt-1 ml-1 flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                >
                  {ttsLoading === i ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Volume2 size={12} />
                  )}
                  {ttsLoading === i ? 'Loading...' : 'Play'}
                </button>
              )}

              {msg.suggestions?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.suggestions.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-white" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <Bot size={16} className="text-indigo-600" />
            </div>
            <div className="bg-slate-50 rounded-2xl px-4 py-3">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={toggleRecording}
          className={`px-4 py-3 rounded-xl transition-colors ${
            recording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300'
          }`}
          title={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={recording ? 'Recording... click mic to stop' : 'Type a message or use the mic...'}
          className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
