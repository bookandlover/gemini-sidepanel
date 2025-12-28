import { Readability } from "@mozilla/readability"

export async function getPageContent(): Promise<{ title: string; content: string } | null> {
    // Use lastFocusedWindow to correctly target the browser window when Side Panel is focused
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    // Ensure we have a tab ID
    if (!tab || !tab.id) {
        console.warn("No active tab found in lastFocusedWindow")
        return null
    }

    // Skip restricted pages where scripting is not allowed
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
        console.warn("Cannot extract content from system pages")
        return { title: "System Page", content: "Content extraction is not available on system pages or empty tabs." }
    }

    try {
        // Attempt to inject script
        const injection = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: false }, // Explicitly set allFrames to false
            func: () => {
                // This runs in the context of the page
                return document.documentElement.outerHTML
            },
        })

        if (!injection || !injection[0] || !injection[0].result) {
            console.warn("Script injection failed or returned empty")
            return null
        }

        const html = injection[0].result
        const doc = new DOMParser().parseFromString(html, "text/html")
        const article = new Readability(doc).parse()

        if (!article) {
            console.warn("Readability failed to parse article")
            // Fallback: try to return body text if Readability fails
            const bodyText = doc.body.innerText.trim().slice(0, 5000)
            if (bodyText) {
                return {
                    title: doc.title || "No Title",
                    content: bodyText
                }
            }
            return null
        }

        return {
            title: article.title || doc.title || "Untitled",
            content: article.textContent || ""
        }
    } catch (error) {
        console.error("Failed to extract content:", error)
        return null
    }
}
