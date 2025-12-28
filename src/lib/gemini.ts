import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"

export async function createGeminiSession(
    apiKey: string,
    modelName: string,
    history: { role: "user" | "model"; content: string; isError?: boolean }[],
    context?: string
) {
    // Filter out internal error messages so they don't break the API context
    const validHistory = history.filter(msg => !msg.isError)

    const genAI = new GoogleGenerativeAI(apiKey)

    const model = genAI.getGenerativeModel({
        model: modelName || "gemini-2.0-flash-exp",
        systemInstruction: context
            ? `You are an intelligent assistant running in a Chrome extension sidebar. 
         Access to the user's current webpage content is provided below. 
         Use this content to answer questions, summarize, or explain concepts.
         
         [[PAGE CONTENT START]]
         ${context}
         [[PAGE CONTENT END]]`
            : "You are an intelligent assistant running in a Chrome extension sidebar.",
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
    })

    // Debug logging
    console.log("Input History (Filtered):", JSON.stringify(validHistory, null, 2))

    // Gemini API requires STRICT history alternation: User -> Model -> User -> Model.
    // It also must start with User.
    // We use this loop to filter out any out-of-sync messages (like consecutive error messages).
    const cleanHistory: { role: "user" | "model", parts: { text: string }[] }[] = []
    let expectUser = true; // We always expect a user message first

    for (const msg of validHistory) {
        if (expectUser && msg.role === "user") {
            cleanHistory.push({ role: "user", parts: [{ text: msg.content }] })
            expectUser = false // Next should be model
        } else if (!expectUser && msg.role === "model") {
            cleanHistory.push({ role: "model", parts: [{ text: msg.content }] })
            expectUser = true // Next should be user
        }
        // If expectation not met, we skip to align state.
    }

    // Edge case: Pop last if it's user (unfinished turn)
    if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === "user") {
        cleanHistory.pop()
    }

    console.log("Cleaned History for API:", JSON.stringify(cleanHistory, null, 2))

    const chat = model.startChat({
        history: cleanHistory,
    })

    return chat
}
