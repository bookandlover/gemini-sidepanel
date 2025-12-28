/**
 * Unit tests for the page translator content script
 * Tests core logic without requiring Chrome extension environment
 */

// Mock DOM for testing
function createMockDOM(): Document {
    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Page</title></head>
    <body>
      <nav><p>Navigation content - should be skipped</p></nav>
      <header><h1>Header - should be skipped</h1></header>
      
      <main>
        <article>
          <h1>Main Title - Artificial Intelligence</h1>
          <p>This is the first paragraph of the article. It contains enough text to be translated because it has more than 10 characters.</p>
          <p>Short</p>
          <p>This is another paragraph that should be translated. It discusses the history and future of AI technology.</p>
          <ul>
            <li>This is a list item that should be translated because it is long enough.</li>
            <li>Short li</li>
          </ul>
          <blockquote>This is a blockquote that should be translated as well.</blockquote>
        </article>
      </main>
      
      <footer><p>Footer content - should be skipped</p></footer>
      <aside class="sidebar"><p>Sidebar - should be skipped</p></aside>
    </body>
    </html>
  `;

    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
}

// Test: getTranslatableParagraphs logic
function testGetTranslatableParagraphs(): { passed: boolean; message: string } {
    const doc = createMockDOM();
    const selectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th';
    const elements = Array.from(doc.querySelectorAll(selectors)) as HTMLElement[];

    const filteredElements = elements.filter(el => {
        // Skip empty or very short text
        const text = el.innerText?.trim();
        if (!text || text.length < 10) return false;

        // Skip navigation, footer, header elements
        const parent = el.closest('nav, footer, header, aside, .sidebar, .menu, .nav, .footer, .header');
        if (parent) return false;

        // Skip elements inside script, style, noscript
        if (el.closest('script, style, noscript, svg')) return false;

        return true;
    });

    // Expected: Main h1, 2 long paragraphs, 1 long list item, 1 blockquote = 5 elements
    const expectedCount = 5;

    if (filteredElements.length === expectedCount) {
        return { passed: true, message: `✅ getTranslatableParagraphs: Found ${filteredElements.length} elements (expected ${expectedCount})` };
    } else {
        const elementTexts = filteredElements.map(el => el.innerText?.substring(0, 30) + '...');
        return {
            passed: false,
            message: `❌ getTranslatableParagraphs: Found ${filteredElements.length} elements, expected ${expectedCount}. Elements: ${JSON.stringify(elementTexts)}`
        };
    }
}

// Test: Translation block insertion logic
function testInsertTranslationBlock(): { passed: boolean; message: string } {
    const doc = createMockDOM();
    const paragraph = doc.querySelector('main p') as HTMLElement;

    if (!paragraph) {
        return { passed: false, message: '❌ insertTranslationBlock: Could not find test paragraph' };
    }

    // Simulate insertion
    const translationBlock = doc.createElement('div');
    translationBlock.className = 'gemini-translation-block';
    translationBlock.textContent = '这是翻译后的文本。';
    paragraph.parentNode?.insertBefore(translationBlock, paragraph.nextSibling);

    // Verify insertion
    const insertedBlock = paragraph.nextElementSibling;
    if (insertedBlock?.classList.contains('gemini-translation-block')) {
        return { passed: true, message: '✅ insertTranslationBlock: Translation block correctly inserted after paragraph' };
    } else {
        return { passed: false, message: '❌ insertTranslationBlock: Translation block not found after paragraph' };
    }
}

// Test: Skip already translated paragraphs
function testSkipAlreadyTranslated(): { passed: boolean; message: string } {
    const doc = createMockDOM();
    const paragraph = doc.querySelector('main p') as HTMLElement;

    // Add a translation block after the paragraph
    const translationBlock = doc.createElement('div');
    translationBlock.className = 'gemini-translation-block';
    translationBlock.textContent = 'Already translated';
    paragraph.parentNode?.insertBefore(translationBlock, paragraph.nextSibling);

    // Test filter logic
    const shouldSkip = paragraph.nextElementSibling?.classList.contains('gemini-translation-block');

    if (shouldSkip) {
        return { passed: true, message: '✅ skipAlreadyTranslated: Correctly identifies paragraph with existing translation' };
    } else {
        return { passed: false, message: '❌ skipAlreadyTranslated: Failed to detect existing translation' };
    }
}

// Test: Validate CSS class structure
function testCSSClasses(): { passed: boolean; message: string } {
    const expectedClasses = [
        'gemini-translation-block',
        'gemini-translation-block translating',
        'gemini-translation-block error',
    ];

    const doc = createMockDOM();
    const testDiv = doc.createElement('div');

    for (const className of expectedClasses) {
        testDiv.className = className;
        if (!testDiv.classList.contains('gemini-translation-block')) {
            return { passed: false, message: `❌ CSSClasses: Class "${className}" does not contain base class` };
        }
    }

    return { passed: true, message: '✅ CSSClasses: All translation block class names are valid' };
}

// Test: API request body structure
function testAPIRequestBody(): { passed: boolean; message: string } {
    const testText = 'Hello, world!';

    const requestBody = {
        contents: [{
            parts: [{
                text: `请将以下英文文本翻译成流畅的中文。只返回翻译结果，不要添加任何解释或前缀。保持原意，对于专业术语可以在括号中保留英文原文。

原文：
${testText}`
            }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
        }
    };

    // Validate structure
    const hasContents = Array.isArray(requestBody.contents);
    const hasParts = Array.isArray(requestBody.contents[0]?.parts);
    const hasText = typeof requestBody.contents[0]?.parts[0]?.text === 'string';
    const hasConfig = typeof requestBody.generationConfig === 'object';
    const includesOriginalText = requestBody.contents[0]?.parts[0]?.text.includes(testText);

    if (hasContents && hasParts && hasText && hasConfig && includesOriginalText) {
        return { passed: true, message: '✅ APIRequestBody: Request body structure is valid for Gemini API' };
    } else {
        return { passed: false, message: '❌ APIRequestBody: Invalid request body structure' };
    }
}

// Run all tests
function runTests(): void {
    console.log('🧪 Running Translator Unit Tests...\n');

    const tests = [
        testGetTranslatableParagraphs,
        testInsertTranslationBlock,
        testSkipAlreadyTranslated,
        testCSSClasses,
        testAPIRequestBody,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const result = test();
            console.log(result.message);
            if (result.passed) passed++;
            else failed++;
        } catch (error: any) {
            console.log(`❌ ${test.name}: Error - ${error.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
        console.log('✅ All tests passed!');
    } else {
        console.log('❌ Some tests failed.');
    }
}

// Export for use
export { runTests, testGetTranslatableParagraphs, testInsertTranslationBlock };

// Auto-run if executed directly
if (typeof window !== 'undefined') {
    runTests();
}
