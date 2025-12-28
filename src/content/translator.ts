/**
 * Content Script: Page Translator
 * 在原页面段落后注入翻译结果，保留原文
 */

// Types
interface TranslateMessage {
  action: 'startTranslate' | 'stopTranslate' | 'removeTranslations';
  apiKey?: string;
  modelName?: string;
}

interface TranslationState {
  isTranslating: boolean;
  abortController: AbortController | null;
  translatedCount: number;
  totalCount: number;
}

// State
const state: TranslationState = {
  isTranslating: false,
  abortController: null,
  translatedCount: 0,
  totalCount: 0,
};

// Inject styles
function injectStyles() {
  if (document.getElementById('gemini-translator-styles')) return;

  const style = document.createElement('style');
  style.id = 'gemini-translator-styles';
  style.textContent = `
    .gemini-translation-block {
      background: linear-gradient(135deg, #f0f8ff 0%, #f5f0ff 100%);
      border-left: 4px solid #7c3aed;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 12px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.8;
      color: #1f2937;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.1);
      position: relative;
      animation: gemini-fade-in 0.3s ease-out;
    }
    
    .gemini-translation-block.translating {
      background: #f9fafb;
      border-left-color: #9ca3af;
    }
    
    .gemini-translation-block.translating::before {
      content: '翻译中...';
      position: absolute;
      top: -10px;
      left: 12px;
      background: #9ca3af;
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 10px;
      letter-spacing: 0.5px;
    }
    
    .gemini-translation-block.error {
      background: #fef2f2;
      border-left-color: #ef4444;
    }
    
    .gemini-translation-block.error::before {
      content: '翻译失败';
      position: absolute;
      top: -10px;
      left: 12px;
      background: #ef4444;
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 10px;
      letter-spacing: 0.5px;
    }
    
    @keyframes gemini-fade-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .gemini-translation-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6b7280;
      font-style: italic;
    }
    
    .gemini-translation-loading::after {
      content: '';
      width: 16px;
      height: 16px;
      border: 2px solid #e5e7eb;
      border-top-color: #7c3aed;
      border-radius: 50%;
      animation: gemini-spin 0.8s linear infinite;
    }
    
    @keyframes gemini-spin {
      to { transform: rotate(360deg); }
    }
    
    /* Progress bar at top of page */
    .gemini-translate-progress {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: #e5e7eb;
      z-index: 999999;
    }
    
    .gemini-translate-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed 0%, #4f46e5 100%);
      transition: width 0.3s ease;
    }
    
    /* Control panel */
    .gemini-translate-control {
      position: fixed;
      top: 16px;
      right: 16px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      padding: 12px 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: gemini-slide-in 0.3s ease-out;
    }
    
    @keyframes gemini-slide-in {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .gemini-translate-control-text {
      font-size: 14px;
      color: #374151;
    }
    
    .gemini-translate-control-btn {
      background: #ef4444;
      color: white;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .gemini-translate-control-btn:hover {
      background: #dc2626;
    }
    
    .gemini-translate-control-btn.remove {
      background: #6b7280;
    }
    
    .gemini-translate-control-btn.remove:hover {
      background: #4b5563;
    }
  `;
  document.head.appendChild(style);
}

// Create progress bar
function createProgressBar(): HTMLDivElement {
  const existing = document.getElementById('gemini-translate-progress');
  if (existing) existing.remove();

  const progress = document.createElement('div');
  progress.id = 'gemini-translate-progress';
  progress.className = 'gemini-translate-progress';
  progress.innerHTML = '<div class="gemini-translate-progress-bar" style="width: 0%"></div>';
  document.body.appendChild(progress);
  return progress;
}

// Update progress
function updateProgress(current: number, total: number) {
  const bar = document.querySelector('.gemini-translate-progress-bar') as HTMLElement;
  if (bar) {
    bar.style.width = `${(current / total) * 100}%`;
  }

  const text = document.querySelector('.gemini-translate-control-text');
  if (text) {
    text.textContent = `翻译中：${current}/${total} 段落`;
  }
}

// Create control panel
function createControlPanel(): HTMLDivElement {
  const existing = document.getElementById('gemini-translate-control');
  if (existing) existing.remove();

  const control = document.createElement('div');
  control.id = 'gemini-translate-control';
  control.className = 'gemini-translate-control';
  control.innerHTML = `
    <span class="gemini-translate-control-text">准备翻译...</span>
    <button class="gemini-translate-control-btn" id="gemini-stop-btn">停止</button>
  `;
  document.body.appendChild(control);

  document.getElementById('gemini-stop-btn')?.addEventListener('click', () => {
    stopTranslation();
  });

  return control;
}

// Remove control panel and progress bar
function removeControlUI() {
  document.getElementById('gemini-translate-progress')?.remove();

  const control = document.getElementById('gemini-translate-control');
  if (control) {
    control.innerHTML = `
      <span class="gemini-translate-control-text">翻译完成！</span>
      <button class="gemini-translate-control-btn remove" id="gemini-remove-btn">移除译文</button>
    `;

    document.getElementById('gemini-remove-btn')?.addEventListener('click', () => {
      removeAllTranslations();
      control.remove();
    });

    // Auto hide after 5 seconds
    setTimeout(() => {
      control.style.opacity = '0';
      control.style.transition = 'opacity 0.5s';
      setTimeout(() => control.remove(), 500);
    }, 5000);
  }
}

// Get translatable paragraphs
function getTranslatableParagraphs(): HTMLElement[] {
  const selectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th';
  const elements = Array.from(document.querySelectorAll(selectors)) as HTMLElement[];

  return elements.filter(el => {
    // Skip if already has translation
    if (el.nextElementSibling?.classList.contains('gemini-translation-block')) return false;

    // Skip empty or very short text
    const text = el.innerText?.trim();
    if (!text || text.length < 10) return false;

    // Skip hidden elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // Skip navigation, footer, header elements
    const parent = el.closest('nav, footer, header, aside, .sidebar, .menu, .nav, .footer, .header');
    if (parent) return false;

    // Skip elements inside script, style, noscript
    if (el.closest('script, style, noscript, svg')) return false;

    return true;
  });
}

// Call Gemini API for translation
async function translateText(text: string, apiKey: string, modelName: string, signal: AbortSignal): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `请将以下英文文本翻译成流畅的中文。只返回翻译结果，不要添加任何解释或前缀。保持原意，对于专业术语可以在括号中保留英文原文。

原文：
${text}`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '翻译失败';
}


// Insert loading placeholder
function insertLoadingPlaceholder(originalElement: HTMLElement): HTMLDivElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'gemini-translation-block translating';
  placeholder.innerHTML = '<span class="gemini-translation-loading">正在翻译</span>';
  originalElement.parentNode?.insertBefore(placeholder, originalElement.nextSibling);
  return placeholder;
}

// Main translation function
async function startTranslation(apiKey: string, modelName: string) {
  if (state.isTranslating) {
    console.log('[Translator] Already translating, ignoring');
    return;
  }

  injectStyles();

  const paragraphs = getTranslatableParagraphs();
  if (paragraphs.length === 0) {
    console.log('[Translator] No paragraphs to translate');
    alert('没有找到可翻译的内容');
    return;
  }

  state.isTranslating = true;
  state.abortController = new AbortController();
  state.translatedCount = 0;
  state.totalCount = paragraphs.length;

  createProgressBar();
  createControlPanel();

  console.log(`[Translator] Starting translation of ${paragraphs.length} paragraphs`);

  for (let i = 0; i < paragraphs.length; i++) {
    if (!state.isTranslating) {
      console.log('[Translator] Translation stopped by user');
      break;
    }

    const paragraph = paragraphs[i];
    const text = paragraph.innerText?.trim();

    if (!text) continue;

    // Insert loading placeholder
    const placeholder = insertLoadingPlaceholder(paragraph);

    try {
      const translated = await translateText(text, apiKey, modelName, state.abortController.signal);

      // Replace placeholder with actual translation
      placeholder.className = 'gemini-translation-block';
      placeholder.textContent = translated;

      state.translatedCount++;
      updateProgress(state.translatedCount, state.totalCount);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        placeholder.remove();
        break;
      }

      console.error('[Translator] Translation error:', error);
      placeholder.className = 'gemini-translation-block error';
      placeholder.textContent = `翻译失败: ${error.message}`;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  state.isTranslating = false;
  state.abortController = null;
  removeControlUI();

  // Notify sidepanel that translation is complete
  chrome.runtime.sendMessage({ action: 'translationComplete', count: state.translatedCount });
}

// Stop translation
function stopTranslation() {
  if (state.abortController) {
    state.abortController.abort();
  }
  state.isTranslating = false;

  // Remove any loading placeholders
  document.querySelectorAll('.gemini-translation-block.translating').forEach(el => el.remove());

  removeControlUI();
}

// Remove all translations
function removeAllTranslations() {
  document.querySelectorAll('.gemini-translation-block').forEach(el => el.remove());
  document.getElementById('gemini-translator-styles')?.remove();
  document.getElementById('gemini-translate-progress')?.remove();
  document.getElementById('gemini-translate-control')?.remove();
}

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((message: TranslateMessage, _sender, sendResponse) => {
  console.log('[Translator] Received message:', message);

  if (message.action === 'startTranslate') {
    if (message.apiKey && message.modelName) {
      startTranslation(message.apiKey, message.modelName);
      sendResponse({ success: true, message: 'Translation started' });
    } else {
      sendResponse({ success: false, message: 'Missing API key or model name' });
    }
  } else if (message.action === 'stopTranslate') {
    stopTranslation();
    sendResponse({ success: true, message: 'Translation stopped' });
  } else if (message.action === 'removeTranslations') {
    removeAllTranslations();
    sendResponse({ success: true, message: 'Translations removed' });
  }

  return true; // Keep message channel open for async response
});

console.log('[Gemini Translator] Content script loaded');
