import { useEffect, useState, useRef } from "react"
import { Settings, Sparkles, Send, Trash2, FileText, Languages, MessageSquare, ChevronDown, ArrowLeft, Copy, Check } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getPageContent } from "@/lib/extractor"
import { createGeminiSession } from "@/lib/gemini"

// Types
interface Message {
  role: "user" | "model"
  content: string
  isError?: boolean
}

const AVAILABLE_MODELS = [
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-preview-09-2025", label: "Gemini 2.5 Flash Preview" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "gemini-2.5-flash-lite-preview-09-2025", label: "Gemini 2.5 Flash Lite Preview" },
]

type ViewState = 'home' | 'chat' | 'settings'

function App() {
  // State
  const [view, setView] = useState<ViewState>('home')
  const [apiKey, setApiKey] = useState<string>("")
  const [modelName, setModelName] = useState<string>("gemini-2.5-flash-lite")

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [pageContext, setPageContext] = useState<string>("")
  const [contextTitle, setContextTitle] = useState<string>("")


  const bottomRef = useRef<HTMLDivElement>(null)

  // Load Settings
  useEffect(() => {
    chrome.storage.local.get(["geminiApiKey", "geminiModel"], (result: { geminiApiKey?: string, geminiModel?: string }) => {
      if (result.geminiApiKey) {
        setApiKey(result.geminiApiKey)
      } else {
        setView('settings')
      }
      setModelName(result.geminiModel || "gemini-2.5-flash-lite")
    })
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const saveSettings = (key: string, model: string) => {
    chrome.storage.local.set({ geminiApiKey: key, geminiModel: model }, () => {
      setApiKey(key)
      setModelName(model)
      setView('home')
    })
  }

  // --- Logic Handlers ---

  const extractContext = async () => {
    // setIsExtracting(true) // Not needed as we switch views
    const data = await getPageContent()
    // setIsExtracting(false)

    if (data && data.content) {
      setPageContext(data.content)
      setContextTitle(data.title)
      return data
    } else {
      // Fallback or error handled by caller checking return
      return null
    }
  }

  // 1. Summarize Page
  const handleSummarize = async () => {
    setView('chat')
    setMessages([{ role: "user", content: "正在总结当前页面..." }])

    const data = await extractContext()
    if (data) {
      const prompt = `请用中文总结这篇文章的主要内容: "${data.title}"`
      await processMessage(prompt, data.content)
    } else {
      setMessages(prev => [...prev, { role: "model", content: "无法读取当前页面内容。请确保您在普通的网页标签页上。", isError: true }])
    }
  }

  // 2. Translate Page - 在原页面进行翻译
  const handleTranslate = async () => {
    if (!apiKey) {
      setView('settings')
      return
    }

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

      if (!tab || !tab.id) {
        alert('无法获取当前标签页')
        return
      }

      // Check if it's a restricted page
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        alert('无法在系统页面上进行翻译')
        return
      }

      // Send message to content script to start translation
      chrome.tabs.sendMessage(tab.id, {
        action: 'startTranslate',
        apiKey: apiKey,
        modelName: modelName,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to send message:', chrome.runtime.lastError)
          alert('翻译启动失败，请刷新页面后重试')
          return
        }
        console.log('Translation started:', response)
      })

    } catch (error) {
      console.error('Translation error:', error)
      alert('翻译启动失败')
    }
  }

  // 3. Start Chat (General or Context)
  const handleStartChat = async () => {
    setMessages([])
    setPageContext("")
    setContextTitle("")
    setView('chat')

    // As requested: "Start Chat" MUST also be based on the open page content.
    // So we silently extract context just like summarize/translate.
    const data = await extractContext()
    if (data) {
      setPageContext(data.content)
      setContextTitle(data.title)
      // Optional: Add a system message to UI saying context loaded?
      // setMessages([{ role: "model", content: `Context loaded: ${data.title}` }]) 
      // Or AI greeting:
      // setMessages([{ role: "model", content: "I've read the page. What would you like to know?" }])
    }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return
    await processMessage(input)
  }

  const processMessage = async (text: string, overrideContext?: string) => {
    if (!apiKey) {
      setView('settings')
      return
    }

    const currentContext = overrideContext || pageContext
    // Only add user message if it wasn't added by the helper functions (like "正在总结...")
    // But for manual input, we always add it.
    // Simpler: Just allow the UI to show what we pushed.

    // If messages length is 0 or last was model, push user msg. 
    // If we just pushed a "Loading..." placeholder, we might want to replace it? 
    // Let's stick to standard chat flow for simplicity.
    if (input) {
      // If triggered by input form
      setMessages(prev => [...prev, { role: "user", content: text }])
      setInput("")
    }

    setIsLoading(true)

    try {
      const session = await createGeminiSession(apiKey, modelName, messages, currentContext)
      const result = await session.sendMessageStream(text)

      let fullResponse = ""
      const modelMsg: Message = { role: "model", content: "" }

      setMessages(prev => [...prev, modelMsg])

      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        fullResponse += chunkText

        setMessages(prev => {
          const newArr = [...prev]
          newArr[newArr.length - 1] = { role: "model", content: fullResponse }
          return newArr
        })
      }
    } catch (error: any) {
      console.error("Gemini Request Failed:", error)
      const errorMsg = error.message || "Failed to get response."
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `**Error**: ${errorMsg}`, isError: true },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // --- Views ---

  if (view === 'settings') {
    return (
      <div className="flex flex-col h-screen w-full bg-background p-6 justify-center items-center gap-6 animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center gap-3 mb-2">
          <img src="/icon-128.png" className="w-16 h-16 rounded-xl shadow-lg" alt="Logo" onError={(e) => e.currentTarget.src = "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg"} />
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Gemini 设置</h1>
          <p className="text-sm text-muted-foreground">配置您的 API Key 和模型</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            const key = formData.get("apikey") as string
            const model = formData.get("model") as string
            if (key) saveSettings(key, model)
          }}
          className="w-full max-w-sm space-y-4"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground ml-1">API Key</label>
            <Input type="password" name="apikey" placeholder="AIza..." defaultValue={apiKey} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground ml-1">模型选择</label>
            <div className="relative">
              <select
                name="model"
                defaultValue={modelName}
                className="w-full flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              注意：部分 Preview 模型可能需要 waitlist 权限。
            </p>
          </div>
          <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90 transition-opacity">
            保存并开始
          </Button>
          <Button variant="ghost" type="button" className="w-full" onClick={() => setView('home')}>返回</Button>
        </form>
      </div>
    )
  }

  if (view === 'home') {
    return (
      <div className="flex flex-col h-screen w-full bg-[#F0F4F9] dark:bg-black relative overflow-hidden font-sans">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-200/40 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-200/40 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <header className="flex items-center justify-between p-4 z-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-gray-700 dark:text-gray-200">Google Gemini</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/50" onClick={() => setView('settings')}>
              <Settings className="w-5 h-5 text-gray-600" />
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 z-10 gap-8">
          {/* Greeting */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-normal bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              晚上好
            </h1>
            <p className="text-2xl text-gray-400 font-light">
              我们今天应该做什么？
            </p>
          </div>

          {/* Model Selector Trigger (Acts as a quick switcher or settings shortcut) */}
          <div
            className="flex items-center gap-2 px-4 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-sm border border-white/20 cursor-pointer hover:scale-105 transition-all w-fit"
            onClick={() => setView('settings')}
          >
            <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {AVAILABLE_MODELS.find(m => m.value === modelName)?.label || modelName}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>

          {/* Action Cards */}
          <div className="w-full max-w-sm space-y-3">
            <button
              onClick={handleStartChat}
              className="w-full flex items-center gap-4 p-4 bg-white/70 dark:bg-gray-800/70 hover:bg-white dark:hover:bg-gray-800 rounded-2xl shadow-sm transition-all group text-left"
            >
              <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full group-hover:scale-110 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-200">开始对话</span>
            </button>

            <button
              onClick={handleSummarize}
              className="w-full flex items-center gap-4 p-4 bg-white/70 dark:bg-gray-800/70 hover:bg-white dark:hover:bg-gray-800 rounded-2xl shadow-sm transition-all group text-left"
            >
              <div className="p-2.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-200">总结此页面</span>
            </button>

            <button
              onClick={handleTranslate}
              className="w-full flex items-center gap-4 p-4 bg-white/70 dark:bg-gray-800/70 hover:bg-white dark:hover:bg-gray-800 rounded-2xl shadow-sm transition-all group text-left"
            >
              <div className="p-2.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full group-hover:scale-110 transition-transform">
                <Languages className="w-5 h-5" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-200">翻译此页面</span>
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Chat View
  return (
    <div className="flex flex-col h-screen w-full bg-white dark:bg-black text-foreground text-sm font-sans">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1 text-gray-500" onClick={() => setView('home')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="font-semibold text-gray-700 dark:text-gray-200">Gemini</h1>
            {contextTitle && <span className="text-[10px] text-green-600 truncate max-w-[150px]">{contextTitle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${pageContext ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}
            onClick={async () => {
              if (pageContext) {
                setPageContext("")
                setContextTitle("")
              } else {
                const data = await extractContext()
                if (!data) {
                  // Show toast or slight visual feedback? 
                  // For now we rely on the internal error handling of extractContext (which returns null)
                  // We can manually push a transient status message if needed.
                }
              }
            }}
            title={pageContext ? "Clear Context" : "Load Page Context"}
          >
            <FileText className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
            setMessages([])
            // Don't clear context here, only messages
          }}>
            <Trash2 className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 opacity-50">
            <Sparkles className="w-12 h-12 mb-2" />
            <p>有什么可以帮你的吗？</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"
              }`}
          >
            <div className={`flex flex-col max-w-[90%] gap-1 group ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-none prose prose-sm dark:prose-invert max-w-none break-words"
                  }`}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>

              {/* Message Actions */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity px-1">
                <CopyButton text={msg.content} />
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-black">
        <form onSubmit={handleSendMessage} className="relative flex items-center">
          <div className="relative w-full">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              disabled={isLoading}
              className="w-full bg-gray-100 dark:bg-gray-900 border-none rounded-full py-3 pl-4 pr-12 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 rounded-full text-white hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export default App
