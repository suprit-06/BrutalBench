import { create } from 'zustand';

type PipelineStatus = 'idle' | 'authenticating' | 'scraping' | 'sanitizing' | 'evaluating' | 'complete' | 'error';

interface PipelineState {
  status: PipelineStatus;
  score: number | null;
  critique: string | null;
  setStatus: (status: PipelineStatus) => void;
  setResult: (score: number, critique: string) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  status: 'idle',
  score: null,
  critique: null,
  setStatus: (status) => set({ status }),
  setResult: (score, critique) => set({ score, critique, status: 'complete' }),
}));
