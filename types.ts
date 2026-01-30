
export type Difficulty = 'Facile' | 'Moyen' | 'Difficile';
export type SelectionMode = 'AI' | 'Manual';

export interface ScoreEntry {
  concept: string;
  difficulty: Difficulty;
  timeTaken: number;
  date: string;
  id: string;
}

export interface PuzzleData {
  concept: string;
  definition: string;
  segments: string[];
}

export enum GameStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST'
}

export interface GameState {
  status: GameStatus;
  difficulty: Difficulty;
  selectionMode: SelectionMode;
  targetConcept: string;
  puzzle: PuzzleData | null;
  pool: string[];
  response: string[];
  timeLeft: number;
  startTime: number | null;
  error: string | null;
  extractedText: string | null;
  history: ScoreEntry[];
  // Tracking for auto-hint
  incorrectAttempts: number;
  lastActivityTime: number;
  lastAutoHintTime: number | null;
}
