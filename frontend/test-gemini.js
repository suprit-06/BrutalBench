import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

async function testGemini() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const systemPrompt = `You are a strict, elite Staff Engineer reviewing a dev's git diffs. You prioritize modularity, security, and performance. Analyze the diffs objectively. Look for tight coupling, memory leaks, N+1 queries, and poor naming.
Output strictly as a JSON object with two fields:
{
  "score": <integer 0-100>,
  "critique": "<exactly 3 highly critical, direct sentences analyzing their mistakes.>"
}`;

        const { HarmCategory, HarmBlockThreshold, SchemaType } = require("@google/generative-ai");
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

        // Create a massive payload of diffs
        let massiveDiff = "";
        for (let i = 0; i < 500; i++) {
            massiveDiff += `\n-console.log("old");\n+console.log("new ${i}");`;
        }

        const result = await chat.sendMessage([
            systemPrompt,
            `User Diffs:\n${massiveDiff}`
        ]);
        
        console.log("FINISH REASON:", result.response.candidates?.[0]?.finishReason);
        console.log("RAW TEXT:", result.response.text());
    } catch (e) {
        console.error("ERROR:", e);
    }
}

testGemini();
