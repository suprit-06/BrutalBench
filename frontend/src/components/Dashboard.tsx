"use client";

import { useEffect } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { Terminal } from './Terminal';
import { usePipelineStore } from '@/store/usePipelineStore';

export default function Dashboard() {
    const { data: session, status: authStatus } = useSession();
    const { status, score, critique, setStatus, setResult } = usePipelineStore();
    
    // We can use the SSR package or auth-helpers. Next.js App Router usually uses @supabase/ssr
    // For client side we use createBrowserClient from @supabase/ssr or createClientComponentClient
    // Let's implement with createBrowserClient from @supabase/ssr in lib/supabase.ts
    // For now we'll import it from lib
    
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
            <h1 className="text-4xl font-mono mb-8 font-bold tracking-tighter uppercase">BrutalBench</h1>
            
            {authStatus === 'loading' ? (
                <div className="text-gray-500 font-mono">LOADING IDENTITY...</div>
            ) : session ? (
                <div className="flex flex-col items-center w-full max-w-2xl">
                    <div className="flex items-center justify-between w-full border-b border-gray-900 pb-4 mb-4">
                        <div className="flex items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={session.user?.image || ''} alt="avatar" className="w-12 h-12 grayscale" />
                            <div>
                                <div className="font-mono text-sm text-gray-500">Subject</div>
                                <div className="font-mono text-lg">{session.user?.name || session.user?.email}</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => signOut()}
                            className="px-4 py-2 border border-gray-500 text-gray-500 font-mono text-sm hover:text-white hover:border-white transition-colors"
                        >
                            DISCONNECT
                        </button>
                    </div>

                    {status === 'idle' && (
                        <button 
                            onClick={async () => {
                                if (!session?.user) return;
                                setStatus('authenticating');
                                try {
                                    const res = await fetch('/api/evaluate', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ user_id: (session.user as any).id })
                                    });
                                    if (!res.ok) throw new Error(await res.text());
                                    const data = await res.json();
                                    setResult(data.score, data.critique);
                                } catch (error) {
                                    console.error(error);
                                    setResult(0, "EVALUATION FAILED.");
                                }
                            }}
                            className="px-8 py-4 bg-white text-black font-mono font-bold hover:bg-gray-100 mt-8"
                        >
                            INITIATE EVALUATION
                        </button>
                    )}

                    <Terminal />
                    
                    {/* Realtime Subscriber removed, falling back to direct API result */}

                    {status === 'complete' && score !== null && (
                        <div className="mt-8 border border-white p-6 w-full">
                            <div className="text-6xl font-mono mb-4 text-center">{score}<span className="text-gray-500 text-2xl">/100</span></div>
                            <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-100">{critique}</div>
                        </div>
                    )}
                </div>
            ) : (
                <button 
                    onClick={() => signIn('github')}
                    className="px-8 py-4 bg-white text-black font-mono font-bold hover:bg-gray-100"
                >
                    AUTHENTICATE VIA GITHUB
                </button>
            )}
        </div>
    );
}

