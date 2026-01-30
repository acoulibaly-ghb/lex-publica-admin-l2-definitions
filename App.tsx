
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  BookOpen, 
  Upload, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Lightbulb,
  ArrowRight,
  BrainCircuit,
  FileText,
  BarChart2,
  Zap,
  FastForward,
  Trophy,
  History as HistoryIcon,
  TrendingUp,
  X,
  Target,
  Sparkles,
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';
import { GameStatus, PuzzleData, GameState, Difficulty, ScoreEntry, SelectionMode } from './types';
import { extractTextFromPdf } from './services/pdfService';
import { generatePuzzle } from './services/geminiService';

const MAX_TIME = 120;
const INACTIVITY_THRESHOLD = 20000;
const ERROR_THRESHOLD = 3;

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
  const activityTimerRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('puzzle_history', JSON.stringify(state.history));
  }, [state.history]);

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
      const puzzle = await generatePuzzle(
        text, 
        state.difficulty, 
        state.selectionMode === 'Manual' ? state.targetConcept : undefined
      );
      
      const shuffled = [...puzzle.segments].sort(() => Math.random() - 0.5);
      
      setState(prev => ({
        ...prev,
        status: GameStatus.PLAYING,
        puzzle,
        pool: shuffled,
        response: [],
        timeLeft: MAX_TIME,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        incorrectAttempts: 0,
        lastAutoHintTime: null,
        extractedText: text,
        error: null
      }));
    } catch (err) {
      console.error(err);
      setState(prev => ({ 
        ...prev, 
        status: GameStatus.IDLE, 
        error: "Échec de l'analyse. Vérifiez votre document ou votre clé API." 
      }));
    }
  };

  const loadNextPuzzle = async () => {
    if (!state.extractedText) return;
    setState(prev => ({ ...prev, status: GameStatus.LOADING, error: null }));

    try {
      const puzzle = await generatePuzzle(
        state.extractedText, 
        state.difficulty,
        state.selectionMode === 'Manual' ? state.targetConcept : undefined
      );
      const shuffled = [...puzzle.segments].sort(() => Math.random() - 0.5);
      
      setState(prev => ({
        ...prev,
        status: GameStatus.PLAYING,
        puzzle,
        pool: shuffled,
        response: [],
        timeLeft: MAX_TIME,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        incorrectAttempts: 0,
        lastAutoHintTime: null,
        error: null
      }));
    } catch (err) {
      setState(prev => ({ ...prev, status: GameStatus.IDLE, error: "Impossible de générer le puzzle suivant." }));
    }
  };

  const resetGame = () => {
    setState(prev => ({
      ...prev,
      status: GameStatus.IDLE,
      puzzle: null,
      pool: [],
      response: [],
      timeLeft: MAX_TIME,
      startTime: null,
      incorrectAttempts: 0,
      lastActivityTime: Date.now(),
      lastAutoHintTime: null,
      extractedText: null,
      error: null
    }));
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const updateActivity = () => {
    setState(prev => ({ ...prev, lastActivityTime: Date.now() }));
  };

  useEffect(() => {
    if (state.status === GameStatus.PLAYING) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.timeLeft <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return { ...prev, timeLeft: 0, status: GameStatus.LOST };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);

      activityTimerRef.current = setInterval(() => {
        setState(prev => {
          const now = Date.now();
          if (now - prev.lastActivityTime > INACTIVITY_THRESHOLD && prev.status === GameStatus.PLAYING) {
            return { ...prev }; 
          }
          return prev;
        });
      }, 2000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activityTimerRef.current) clearInterval(activityTimerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activityTimerRef.current) clearInterval(activityTimerRef.current);
    };
  }, [state.status]);

  useEffect(() => {
    if (state.status !== GameStatus.PLAYING) return;
    const now = Date.now();
    const inactive = now - state.lastActivityTime > INACTIVITY_THRESHOLD;
    const tooManyErrors = state.incorrectAttempts >= ERROR_THRESHOLD;
    if (inactive || tooManyErrors) { giveHint(true); }
  }, [state.lastActivityTime, state.incorrectAttempts]);

  const moveToResponse = (segment: string, index: number) => {
    if (state.status !== GameStatus.PLAYING) return;
    updateActivity();
    setState(prev => ({
      ...prev,
      pool: prev.pool.filter((_, i) => i !== index),
      response: [...prev.response, segment]
    }));
  };

  const moveToPool = (segment: string, index: number) => {
    if (state.status !== GameStatus.PLAYING) return;
    updateActivity();
    setState(prev => ({
      ...prev,
      response: prev.response.filter((_, i) => i !== index),
      pool: [...prev.pool, segment]
    }));
  };

  const giveHint = (isAuto: boolean = false) => {
    setState(prev => {
      if (prev.status !== GameStatus.PLAYING || !prev.puzzle) return prev;
      const correctSegments = prev.puzzle.segments;
      let nextIndex = 0;
      while (nextIndex < correctSegments.length && prev.response[nextIndex] === correctSegments[nextIndex]) { nextIndex++; }
      if (nextIndex >= correctSegments.length) return prev;
      const neededSegment = correctSegments[nextIndex];
      let newPool = [...prev.pool];
      let newResponse = [...prev.response];
      const currentPosInResponse = newResponse.indexOf(neededSegment, nextIndex);
      if (currentPosInResponse !== -1) {
        newResponse.splice(currentPosInResponse, 1);
        newResponse.splice(nextIndex, 0, neededSegment);
      } else {
        const currentPosInPool = newPool.indexOf(neededSegment);
        if (currentPosInPool !== -1) {
          newPool.splice(currentPosInPool, 1);
          newResponse.splice(nextIndex, 0, neededSegment);
        }
      }
      return { 
        ...prev, 
        pool: newPool, 
        response: newResponse, 
        lastActivityTime: Date.now(),
        incorrectAttempts: isAuto ? 0 : prev.incorrectAttempts,
        lastAutoHintTime: isAuto ? Date.now() : prev.lastAutoHintTime
      };
    });
  };

  const checkResult = () => {
    if (!state.puzzle) return;
    updateActivity();
    const isCorrect = JSON.stringify(state.response) === JSON.stringify(state.puzzle.segments);
    if (isCorrect) {
      const timeTaken = MAX_TIME - state.timeLeft;
      const newScore: ScoreEntry = {
        id: Date.now().toString(),
        concept: state.puzzle.concept,
        difficulty: state.difficulty,
        timeTaken,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      };
      setState(prev => ({ 
        ...prev, 
        status: GameStatus.WON,
        history: [newScore, ...prev.history].slice(0, 50)
      }));
    } else {
      setState(prev => ({ ...prev, incorrectAttempts: prev.incorrectAttempts + 1 }));
    }
  };

  const progress = (state.timeLeft / MAX_TIME) * 100;
  const isAutoHintVisible = state.lastAutoHintTime && (Date.now() - state.lastAutoHintTime < 5000);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar UI */}
      <aside className="w-full md:w-80 glass-sidebar text-white p-8 flex flex-col gap-10 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-500/30">
            <BrainCircuit size={28} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight leading-none">Phrase Master</h1>
            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Version React 19</span>
          </div>
        </div>

        <nav className="flex flex-col gap-8">
          {/* Mode Sélection */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Mode de révision</h3>
            <div className="grid grid-cols-2 p-1 bg-slate-800/50 rounded-2xl border border-slate-700/50">
              {(['AI', 'Manual'] as SelectionMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setState(p => ({ ...p, selectionMode: mode }))}
                  disabled={state.status !== GameStatus.IDLE}
                  className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2
                    ${state.selectionMode === mode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 disabled:opacity-30'}`}
                >
                  {mode === 'AI' ? <Sparkles size={14} /> : <Target size={14} />}
                  {mode === 'AI' ? 'Auto' : 'Manuel'}
                </button>
              ))}
            </div>
            {state.selectionMode === 'Manual' && (
              <input 
                type="text"
                value={state.targetConcept}
                onChange={(e) => setState(prev => ({ ...prev, targetConcept: e.target.value }))}
                placeholder="Ex: Photosynthèse..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              />
            )}
          </section>

          {/* Difficulté */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Difficulté</h3>
            <div className="flex flex-col gap-2">
              {(['Facile', 'Moyen', 'Difficile'] as Difficulty[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setState(p => ({ ...p, difficulty: level }))}
                  disabled={state.status !== GameStatus.IDLE}
                  className={`w-full py-3 px-4 text-sm font-bold rounded-xl border transition-all flex items-center justify-between
                    ${state.difficulty === level 
                      ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.2)]' 
                      : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-600 disabled:opacity-30'}`}
                >
                  {level}
                  {state.difficulty === level && <ChevronRight size={16} />}
                </button>
              ))}
            </div>
          </section>

          {/* Upload */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Document</h3>
            <label className="group flex flex-col items-center justify-center gap-3 w-full p-8 border-2 border-dashed border-slate-700 rounded-3xl cursor-pointer hover:border-indigo-500 hover:bg-indigo-500/5 transition-all">
              <Upload size={24} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
              <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200">Charger PDF</span>
              <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" disabled={state.status === GameStatus.LOADING} />
            </label>
          </section>
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <button onClick={() => setShowDashboard(true)} className="flex items-center justify-center gap-2 w-full p-4 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-2xl text-xs font-bold transition-all border border-slate-700">
            <LayoutDashboard size={16} /> Dashboard & Scores
          </button>
          {state.status !== GameStatus.IDLE && (
            <button onClick={resetGame} className="text-xs font-bold text-slate-500 hover:text-white transition-colors text-center py-2 underline underline-offset-4">
              Annuler et réinitialiser
            </button>
          )}
        </div>
      </aside>

      {/* Main Game Stage */}
      <main className="flex-1 bg-slate-50 p-6 md:p-12 overflow-y-auto flex flex-col items-center">
        <div className="w-full max-w-4xl flex flex-col flex-1">
          
          {/* Welcome View */}
          {state.status === GameStatus.IDLE && (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-8 animate-in fade-in zoom-in duration-700">
              <div className="w-32 h-32 bg-white rounded-[3rem] shadow-2xl flex items-center justify-center border border-slate-100 relative">
                <BookOpen size={64} className="text-indigo-600" />
                <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-emerald-500 rounded-2xl shadow-lg flex items-center justify-center text-white border-4 border-white">
                  <Sparkles size={20} />
                </div>
              </div>
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-4">Mémorisez l'essentiel</h2>
                <p className="text-slate-500 text-lg leading-relaxed">Transformez vos cours en un jeu de construction pour ancrer durablement les définitions complexes dans votre mémoire.</p>
              </div>
              {state.error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 text-sm font-medium flex gap-3 items-center">
                  <AlertTriangle size={18} /> {state.error}
                </div>
              )}
            </div>
          )}

          {/* Loading View */}
          {state.status === GameStatus.LOADING && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto text-indigo-600" size={32} />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Gemini analyse votre cours...</h3>
                <p className="text-slate-400 text-sm">Extraction du concept clé le plus pertinent.</p>
              </div>
            </div>
          )}

          {/* Game Playing View */}
          {(state.status === GameStatus.PLAYING || state.status === GameStatus.WON || state.status === GameStatus.LOST) && state.puzzle && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
              {/* Top Banner */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-8">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg">Apprentissage</span>
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-lg">{state.difficulty}</span>
                  </div>
                  <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{state.puzzle.concept}</h2>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="bg-white px-6 py-4 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-4">
                    <Clock className={`${state.timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`text-2xl font-black font-mono tabular-nums ${state.timeLeft < 30 ? 'text-red-600' : 'text-slate-900'}`}>
                      {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>

              {/* Status Notifications */}
              {state.status === GameStatus.WON && (
                <div className="p-8 bg-emerald-500 rounded-[3rem] text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl shadow-emerald-500/30 animate-in zoom-in-95">
                  <Trophy size={64} className="opacity-80" />
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-2xl font-black mb-1">Excellent travail !</h3>
                    <p className="text-emerald-50 mb-6">Vous avez parfaitement assemblé cette définition.</p>
                    <button onClick={loadNextPuzzle} className="flex items-center gap-2 bg-white text-emerald-600 px-8 py-4 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all">
                      Prochain défi <FastForward size={20} />
                    </button>
                  </div>
                </div>
              )}

              {state.status === GameStatus.LOST && (
                <div className="p-8 bg-red-500 rounded-[3rem] text-white flex items-center gap-6 shadow-2xl shadow-red-500/30">
                  <AlertTriangle size={48} />
                  <div>
                    <h3 className="text-xl font-black">Temps écoulé</h3>
                    <p className="text-red-50">Analysez la solution ci-dessous pour ne plus l'oublier.</p>
                  </div>
                </div>
              )}

              {/* Game Board */}
              <div className="space-y-12">
                {/* Board: Target */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-4">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Votre construction</span>
                    {state.status === GameStatus.PLAYING && (
                      <button onClick={() => giveHint(false)} className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 hover:underline">
                        <Lightbulb size={14} /> Besoin d'un indice ?
                      </button>
                    )}
                  </div>
                  <div className={`min-h-[220px] p-10 bg-white rounded-[3rem] border-2 border-dashed transition-all flex flex-wrap content-start gap-4 ${state.status === GameStatus.PLAYING ? 'border-indigo-200 shadow-2xl shadow-indigo-500/5' : 'border-slate-200 bg-slate-50/50'}`}>
                    {state.response.length === 0 && state.status === GameStatus.PLAYING && (
                      <div className="w-full flex items-center justify-center py-12 text-slate-300 italic text-sm font-medium">Glissez les segments ici pour bâtir la définition...</div>
                    )}
                    {state.response.map((seg, idx) => (
                      <button key={`res-${idx}`} onClick={() => moveToPool(seg, idx)} disabled={state.status !== GameStatus.PLAYING} className="segment-button px-6 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 active:scale-95 border border-indigo-500">
                        {seg}
                      </button>
                    ))}
                    {(state.status === GameStatus.LOST || state.status === GameStatus.WON) && (
                      <div className="w-full mt-10 pt-10 border-t border-slate-100 animate-in fade-in slide-in-from-top-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Texte de référence :</span>
                        <p className="text-xl font-extrabold text-slate-800 leading-relaxed italic decoration-indigo-200 decoration-8 underline underline-offset-8 decoration-skip-ink-none">{state.puzzle.definition}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Board: Pool */}
                {state.status === GameStatus.PLAYING && (
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] px-4">Segments disponibles</span>
                    <div className="p-10 bg-slate-100/50 rounded-[3rem] border border-slate-200/60 flex flex-wrap gap-4 shadow-inner">
                      {state.pool.map((seg, idx) => (
                        <button key={`pool-${idx}`} onClick={() => moveToResponse(seg, idx)} className="segment-button px-6 py-4 bg-white text-slate-700 rounded-2xl text-sm font-bold shadow-sm border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 active:scale-95">
                          {seg}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validation Button */}
                {state.status === GameStatus.PLAYING && (
                  <div className="flex justify-center">
                    <button onClick={checkResult} className="group px-14 py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:bg-indigo-950 hover:shadow-indigo-500/20 transition-all hover:-translate-y-1 active:translate-y-0 flex items-center gap-4">
                      Vérifier l'exactitude <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Stats Modal */}
      {showDashboard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <header className="p-10 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Trophy size={24} /></div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Performances</h2>
              </div>
              <button onClick={() => setShowDashboard(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: "Réussites", val: state.history.length, color: "text-indigo-600", bg: "bg-indigo-50" },
                  { label: "Précision", val: "100%", color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Moyenne", val: `${state.history.length > 0 ? Math.round(state.history.reduce((a, b) => a + b.timeTaken, 0) / state.history.length) : 0}s`, color: "text-slate-600", bg: "bg-slate-50" }
                ].map((s, i) => (
                  <div key={i} className={`${s.bg} p-6 rounded-[2rem] text-center border border-white/50 shadow-sm`}>
                    <span className={`block text-3xl font-black ${s.color} mb-1`}>{s.val}</span>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2"><HistoryIcon size={14} /> Historique récent</h3>
                <div className="space-y-3">
                  {state.history.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-[1.5rem] hover:bg-white hover:shadow-md transition-all">
                      <div>
                        <p className="font-black text-slate-900">{s.concept}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.date}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{s.difficulty}</span>
                        <span className="font-mono font-black text-indigo-600">{s.timeTaken}s</span>
                      </div>
                    </div>
                  ))}
                  {state.history.length === 0 && <p className="text-center text-slate-400 py-10 italic">Aucune donnée de progression pour le moment.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
