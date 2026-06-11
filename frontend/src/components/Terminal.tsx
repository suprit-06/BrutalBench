"use client";
import { useEffect, useState } from 'react';
import { usePipelineStore } from '@/store/usePipelineStore';

const MESSAGES = [
    "> INITIATING N8N PIPELINE...",
    "> SCRAPING LAST 50 COMMITS...",
    "> BYPASSING RATE LIMITS...",
    "> SANITIZING AST TREES...",
    "> ANALYZING ARCHITECTURAL COMPLEXITY..."
];

export const Terminal = () => {
    const status = usePipelineStore(state => state.status);
    const [msgIndex, setMsgIndex] = useState(0);

    useEffect(() => {
        if (status === 'complete' || status === 'error' || status === 'idle') return;
        const interval = setInterval(() => setMsgIndex(prev => (prev + 1) % MESSAGES.length), 3000);
        return () => clearInterval(interval);
    }, [status]);

    if (status === 'idle') return null;

    return (
        <div className="bg-black text-white p-6 font-mono text-sm leading-relaxed max-w-2xl w-full border border-gray-900 mt-8">
            <div className="mb-4 text-gray-500">{"// BRUTALBENCH EVALUATION TERMINAL"}</div>
            <div className="text-white mb-2">{"> AUTHENTICATED AS @USER"}</div>
            {status !== 'complete' && (
                <div className="animate-pulse text-gray-100">{MESSAGES[msgIndex]}</div>
            )}
            {status === 'complete' && (
                <div className="text-white mt-2 font-bold">{"> EVALUATION COMPLETE."}</div>
            )}
        </div>
    );
};
