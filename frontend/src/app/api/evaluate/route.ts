import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from "@google/generative-ai";
import { getEncoding } from "js-tiktoken";

// Initialize Supabase Client (Service Role for bypassing RLS to insert)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

function purgeGarbageTokens(content: string): string {
    let text = content;
    text = text.replace(/diff --git a\/(.*?package-lock\.json|.*?yarn\.lock|.*?pnpm-lock\.yaml)[\s\S]*?(?=diff --git|$)/g, '');
    text = text.replace(/diff --git a\/.*\.svg[\s\S]*?(?=diff --git|$)/g, '');
    text = text.replace(/diff --git a\/.*\.css[\s\S]*?(?=diff --git|$)/g, '');
    text = text.replace(/[A-Za-z0-9+/]{100,}={0,2}/g, '[BASE64_REMOVED]');
    text = text.replace(/diff --git a\/.*\.map[\s\S]*?(?=diff --git|$)/g, '');
    return text;
}

function enforceTokenLimit(text: string, maxTokens: number = 5000): string {
    try {
        const encoding = getEncoding("cl100k_base");
        const tokens = encoding.encode(text);
        
        if (tokens.length <= maxTokens) {
            return text;
        }
        
        const headTokens = tokens.slice(0, 2500);
        const tailTokens = tokens.slice(tokens.length - 2500);
        
        const headText = encoding.decode(headTokens);
        const tailText = encoding.decode(tailTokens);
        
        return headText + "\n\n...[MASSIVE CODE OMITTED FOR SANITY]...\n\n" + tailText;
    } catch (e) {
        // Fallback simple truncation if tiktoken fails
        return text.length > 20000 ? text.substring(0, 10000) + "\n\n...[OMITTED]...\n\n" + text.substring(text.length - 10000) : text;
    }
}

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate user session
        // @ts-ignore
        const session = await getServerSession({
            callbacks: {
              session: ({ session, token }: any) => {
                session.accessToken = token.accessToken as string;
                if(!session.user) session.user = {};
                session.user.id = token.sub as string;
                return session;
              }
            }
        });

        // We must fetch the access_token from the DB if session doesn't expose it directly, 
        // or just use a simpler auth extraction. But since we need the user's Github token, let's grab it from Supabase users table.
        // The client POSTed this request, let's extract user_id from session or body.
        
        const { user_id } = await req.json();
        
        if (!user_id) {
             return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
        }

        // Fetch user from DB to get access_token
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('access_token')
            .eq('id', user_id)
            .single();

        if (userError || !user?.access_token) {
            return NextResponse.json({ error: "Could not retrieve GitHub token." }, { status: 401 });
        }

        const githubToken = user.access_token;

        // 2. Fetch Repositories
        const reposRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=3&affiliation=owner", {
            headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json"
            }
        });
        
        if (!reposRes.ok) {
            throw new Error("Failed to fetch repositories.");
        }
        
        const repos = await reposRes.json();
        if (!repos || repos.length === 0) {
            return NextResponse.json({ score: 0, critique: "User has zero public commits. Architecturally nonexistent." });
        }

        let combinedDiff = "";

        // 3. Fetch Commits & Diffs
        for (const repo of repos) {
            const commitsRes = await fetch(`https://api.github.com/repos/${repo.full_name}/commits?per_page=5`, {
                headers: {
                    "Authorization": `Bearer ${githubToken}`,
                    "Accept": "application/vnd.github.v3+json"
                }
            });
            
            if (!commitsRes.ok) continue;
            const commits = await commitsRes.json();
            
            if (!Array.isArray(commits)) continue; // Protect against empty repositories returning error objects
            
            for (const commit of commits) {
                const diffRes = await fetch(`https://api.github.com/repos/${repo.full_name}/commits/${commit.sha}`, {
                    headers: {
                        "Authorization": `Bearer ${githubToken}`,
                        "Accept": "application/vnd.github.v3.diff"
                    }
                });
                
                if (diffRes.ok) {
                    const diffText = await diffRes.text();
                    combinedDiff += `\n--- COMMIT SEPARATOR ---\n${diffText}`;
                }
            }
        }

        if (!combinedDiff.trim()) {
            return NextResponse.json({ score: 0, critique: "No meaningful code diffs found in recent commits." });
        }

        // 4. Sanitize and Chunk
        const cleanedDiff = purgeGarbageTokens(combinedDiff);
        const finalPayload = enforceTokenLimit(cleanedDiff, 2000);

        // 5. Evaluate with Gemini (Retry logic for 503s)
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
        
        const systemPrompt = `You are a strict, elite Staff Engineer reviewing a dev's git diffs. You prioritize modularity, security, and performance. Analyze the diffs objectively. Look for tight coupling, memory leaks, N+1 queries, and poor naming.
Output strictly as a JSON object with two fields:
{
  "score": <integer 0-100>,
  "critique": "<exactly 3 highly critical, direct sentences analyzing their mistakes.>"
}`;

        const chat = model.startChat({
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000,
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        score: { type: SchemaType.INTEGER, description: "A ruthless score from 0 to 100" },
                        critique: { type: SchemaType.STRING, description: "Exactly 3 highly critical, direct sentences analyzing their mistakes." }
                    },
                    required: ["score", "critique"]
                }
            },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
        });

        let responseText = "";
        let finishReason;
        let retries = 3;
        let result;

        while (retries > 0) {
            try {
                result = await chat.sendMessage([
                    systemPrompt,
                    `User Diffs:\n${finalPayload}`
                ]);
                responseText = result.response.text();
                finishReason = result.response.candidates?.[0]?.finishReason;
                
                // If it successfully finished or returned valid JSON, break out
                try {
                    JSON.parse(responseText);
                    break;
                } catch(e) {
                    // Not valid JSON yet, check if we should retry
                    if (finishReason === 'STOP') {
                        // It stopped but JSON is invalid. Extremely rare with responseSchema.
                        break;
                    }
                }
                
                console.log(`Generation stopped prematurely with reason: ${finishReason}. Retrying...`);
                retries--;
                await new Promise(res => setTimeout(res, 2000)); // wait 2s
            } catch (error: any) {
                console.error(`Gemini API Request failed: ${error.message}. Retries left: ${retries - 1}`);
                retries--;
                if (retries > 0) {
                    await new Promise(res => setTimeout(res, 3000));
                } else {
                    break;
                }
            }
        }

        if (!responseText) {
            console.error("Gemini API exhausted all retries.");
            return NextResponse.json({
                score: 0,
                critique: "EVALUATION FAILED: Google Gemini API is currently experiencing a severe outage or rate limiting. Please try again in a few minutes."
            });
        }
        
        let evaluation = { score: 0, critique: "PIPELINE FATAL ERROR." };
        
        try {
            console.log("Raw Gemini Response:", responseText);
            console.log("Finish Reason:", finishReason);
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                evaluation = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON object found in response");
            }
        } catch (e) {
            console.error("Failed to parse Gemini JSON:", responseText, e);
        }

        // 6. Save to Supabase
        const { error: insertError } = await supabase.from('evaluations').insert({
            user_id: user_id,
            score: evaluation.score,
            critique: evaluation.critique
        });

        if (insertError) {
            console.error("Supabase Insert Error:", insertError);
            throw new Error(`Failed to save to database: ${insertError.message}`);
        }

        // 7. Return to Client
        return NextResponse.json(evaluation);

    } catch (error: any) {
        console.error("Evaluation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
