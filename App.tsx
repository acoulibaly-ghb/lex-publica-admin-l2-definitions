import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  AlertTriangle, 
  Clock, 
  BrainCircuit,
  Trophy,
  History as HistoryIcon,
  X,
  Target,
  Sparkles,
  ChevronRight,
  LayoutDashboard,
  RotateCcw,
  ArrowRight
} from 'lucide-react';
import { GameStatus, PuzzleData, GameState, Difficulty, ScoreEntry } from './types';
import { extractTextFromPdf } from './services/pdfService';
import { generatePuzzle } from './services/geminiService';

const MAX_TIME = 180;

const App: React.FC = () => {
  const [state, setState] = useState<GameState>(() => {
    const savedHistory = localStorage.getItem('puzzle_history');
    return {
      status: GameStatus.IDLE,
      difficulty: 'Moyen',
      selectionMode: 'AI',
      targetConcept: '',
      puzzle: null,
      pool: [],
      response: [],
      timeLeft: MAX_TIME,
      startTime: null,
      error: null,
      extractedText: null,
      history: savedHistory ? JSON.parse(savedHistory) : [],
      incorrectAttempts: 0,
      lastActivityTime: Date.now(),
      lastAutoHintTime: null
    };
  });

  const [showDashboard, setShowDashboard] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('puzzle_history', JSON.stringify(state.history));
  }, [state.history]);

  // Timer logic for the game
  useEffect(() => {
    if (state.status === GameStatus.PLAYING && state.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.timeLeft <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return { ...prev, timeLeft: 0, status: GameStatus.LOST };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.status]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (state.selectionMode === 'Manual' && !state.targetConcept.trim()) {
      setState(prev => ({ ...prev, error: "Veuillez saisir un concept avant de charger le document." }));
      return;
    }

    setState(prev => ({ ...prev, status: GameStatus.LOADING, error: null }));

    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim().length < 10) {
        throw new Error("Le PDF semble vide ou illisible.");
      }

      // Fix: Third argument to generatePuzzle must be string | undefined, not boolean.
      const puzzle = await generatePuzzle(
        text, 
        state.difficulty, 
        state.selectionMode === 'Manual' ? state.targetConcept : undefined
      );

      const pool = [...puzzle.segments].sort(() => Math.random() - 0.5);

      setState(prev => ({
        ...prev,
        status: GameStatus.PLAYING,
        puzzle,
        pool,
        response: [],
        timeLeft: MAX_TIME,
        startTime: Date.now(),
        extractedText: text,
        incorrectAttempts: 0
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, status: GameStatus.IDLE, error: err.message }));
    }
  };

  const handleSegmentClick = (segment: string, isFromPool: boolean) => {
    if (state.status !== GameStatus.PLAYING) return;

    setState(prev => {
      let newPool = [...prev.pool];
      let newResponse = [...prev.response];

      if (isFromPool) {
        const index = newPool.indexOf(segment);
        if (index > -1) {
          newPool.splice(index, 1);
          newResponse.push(segment);
        }
      } else {
        const index = newResponse.indexOf(segment);
        if (index > -1) {
          newResponse.splice(index, 1);
          newPool.push(segment);
        }
      }

      // Check win condition when all segments are placed
      if (newPool.length === 0 && prev.puzzle) {
        const isCorrect = newResponse.join('') === prev.puzzle.segments.join('');
        if (isCorrect) {
          const entry: ScoreEntry = {
            id: Math.random().toString(36).substr(2, 9),
            concept: prev.puzzle.concept,
            difficulty: prev.difficulty,
            timeTaken: MAX_TIME - prev.timeLeft,
            date: new Date().toLocaleDateString()
          };
          return { 
            ...prev, 
            pool: newPool, 
            response: newResponse, 
            status: GameStatus.WON, 
            history: [entry, ...prev.history] 
          };
        } else {
          return { ...prev, pool: newPool, response: newResponse, incorrectAttempts: prev.incorrectAttempts + 1 };
        }
      }

      return { ...prev, pool: newPool, response: newResponse };
    });
  };

  const resetGame = () => {
    setState(prev => ({
      ...prev,
      status: GameStatus.IDLE,
      puzzle: null,
      pool: [],
      response: [],
      error: null,
      targetConcept: ''
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <header className="max-w-4xl mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg">
            <BrainCircuit size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">EduPuzzle</h1>
        </div>
        <button 
          onClick={() => setShowDashboard(!showDashboard)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors"
        >
          {showDashboard ? <X size={20} /> : <LayoutDashboard size={20} />}
          <span className="hidden sm:inline">{showDashboard ? 'Fermer' : 'Historique'}</span>
        </button>
      </header>

      <main className="max-w-4xl mx-auto">
        {showDashboard ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 animate-in fade-in duration-300">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <HistoryIcon className="text-indigo-600" /> Vos Réussites
            </h2>
            {state.history.length === 0 ? (
              <p className="text-slate-500 text-center py-12">Aucun puzzle complété pour le moment.</p>
            ) : (
              <div className="space-y-4">
                {state.history.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <h3 className="font-semibold">{entry.concept}</h3>
                      <p className="text-sm text-slate-500">{entry.date} • {entry.difficulty}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-indigo-600 font-medium">
                        <Clock size={16} /> {entry.timeTaken}s
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : state.status === GameStatus.IDLE || state.status === GameStatus.LOADING ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-8">
              <div className="max-w-md mx-auto space-y-8">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Prêt à réviser ?</h2>
                  <p className="text-slate-500">Chargez un PDF et laissez l'IA générer un puzzle de mémorisation.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Difficulté</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Facile', 'Moyen', 'Difficile'] as Difficulty[]).map(d => (
                        <button
                          key={d}
                          onClick={() => setState(prev => ({ ...prev, difficulty: d }))}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            state.difficulty === d ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Mode de sélection</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setState(prev => ({ ...prev, selectionMode: 'AI' }))}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          state.selectionMode === 'AI' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Sparkles size={16} /> IA Libre
                      </button>
                      <button
                        onClick={() => setState(prev => ({ ...prev, selectionMode: 'Manual' }))}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          state.selectionMode === 'Manual' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Target size={16} /> Ciblé
                      </button>
                    </div>
                  </div>

                  {state.selectionMode === 'Manual' && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Concept à réviser</label>
                      <input 
                        type="text" 
                        value={state.targetConcept}
                        onChange={(e) => setState(prev => ({ ...prev, targetConcept: e.target.value }))}
                        placeholder="Ex: Photosynthèse..."
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>
                  )}

                  <div className="pt-4">
                    <label className="relative block w-full aspect-video border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={state.status === GameStatus.LOADING} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                        <Upload className="text-slate-400" />
                        <p className="font-semibold text-slate-700">Déposer un PDF</p>
                      </div>
                      {state.status === GameStatus.LOADING && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                          <p className="font-medium text-indigo-900">Préparation du puzzle...</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {state.error && (
                  <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100">
                    <AlertTriangle size={20} />
                    <p className="text-sm">{state.error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Clock size={20} className={state.timeLeft < 30 ? 'text-red-600 animate-pulse' : 'text-slate-600'} />
                  <p className={`text-lg font-mono font-bold ${state.timeLeft < 30 ? 'text-red-600' : 'text-slate-700'}`}>
                    {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
              <button onClick={resetGame} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><X size={20} /></button>
            </div>

            <div className="text-center py-4">
              <p className="text-xs uppercase font-bold text-slate-400 mb-1">Concept à reconstituer</p>
              <h2 className="text-3xl font-black text-indigo-900 tracking-wider uppercase">{state.puzzle?.concept}</h2>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-slate-200 min-h-[120px] relative">
              <div className="flex flex-wrap gap-2">
                {state.response.map((seg, i) => (
                  <button
                    key={`resp-${i}`}
                    onClick={() => handleSegmentClick(seg, false)}
                    className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 font-medium transition-all hover:bg-indigo-100"
                  >
                    {seg}
                  </button>
                ))}
                {state.response.length === 0 && <span className="text-slate-300 italic flex items-center gap-2"><ChevronRight size={18} /> Commencez à cliquer sur les segments ci-dessous...</span>}
              </div>
            </div>

            <div className="bg-slate-100 p-6 rounded-3xl border-2 border-slate-200 border-dashed">
              <div className="flex flex-wrap gap-3 justify-center">
                {state.pool.map((seg, i) => (
                  <button
                    key={`pool-${i}`}
                    onClick={() => handleSegmentClick(seg, true)}
                    className="px-4 py-2 bg-white text-slate-700 rounded-xl border border-slate-200 shadow-sm hover:translate-y-[-2px] hover:border-indigo-300 transition-all font-medium"
                  >
                    {seg}
                  </button>
                ))}
              </div>
            </div>

            {state.status === GameStatus.WON && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <Trophy size={32} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Excellent !</h2>
                    <p className="text-slate-500 italic">"{state.puzzle?.definition}"</p>
                  </div>
                  <button onClick={resetGame} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all">
                    Nouveau Défi <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {state.status === GameStatus.LOST && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-6">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <Clock size={32} />
                  </div>
                  <h2 className="text-2xl font-bold">Temps écoulé !</h2>
                  <button onClick={resetGame} className="w-full py-3 bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-all">
                    Réessayer <RotateCcw size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
