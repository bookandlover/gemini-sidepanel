# Gemini Side Panel Assistant

一个基于 Google Gemini 模型的 Chrome 浏览器侧边栏助手扩展。它可以帮助您总结网页内容、进行智能对话，并提供**原文保留的页面内嵌翻译**功能。

![无需离开页面，AI 触手可及](./public/icon-128.png)

## ✨ 主要功能

*   **🤖 智能侧边栏对话**：直接在浏览器侧边栏与 Gemini 模型进行对话，支持上下文感知。
*   **📝 网页一键总结**：自动提取当前网页内容，生成精准的中文摘要。
*   **🌍 沉浸式双语翻译**：
    *   **原文保留**：翻译结果直接插入在原文段落下方，方便对照阅读。
    *   **页面内嵌**：无需跳转，翻译内容完美融合进当前页面样式。
    *   **智能识别**：自动识别主要内容区域，跳过导航栏和广告。
*   **⚙️ 多模型支持**：支持切换 Gemini 2.5 Flash, Pro 等多种模型版本。

## 🛠️ 安装与构建

本项目使用 React + Vite + TypeScript 构建。

### 前置要求
*   Node.js (建议 v16+)
*   npm 或 yarn

### 1. 克隆项目
```bash
git clone https://github.com/bookandlover/gemini-sidepanel.git
cd gemini-sidepanel
```

### 2. 安装依赖
```bash
npm install
```

### 3. 构建项目
```bash
npm run build
```
构建完成后，会生成一个 `dist` 目录。

### 4. 加载到 Chrome
1.  打开 Chrome 浏览器，输入 `chrome://extensions/` 进入扩展管理页面。
2.  打开右上角的 **"开发者模式" (Developer mode)** 开关。
3.  点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**。
4.  选择本项目下的 `dist` 目录。

## 📖 使用指南

### 配置 API Key
1.  首次安装后，点击浏览器栏的扩展图标，选择 "Gemini Side Panel Assistant"。
2.  侧边栏会自动打开，首次使用会提示您输入 API Key。
3.  前往 [Google AI Studio](https://aistudio.google.com/) 获取免费的 Gemini API Key。
4.  将 Key 填入设置界面并保存。

### 开始使用
*   **开始对话**：像使用 ChatGPT 一样与 AI 自由交谈。
*   **总结此页面**：点击首页的"总结此页面"卡片，AI 会读取当前标签页内容并生成摘要。
*   **翻译此页面**：
    1.  点击"翻译此页面"。
    2.  页面顶部会出现紫色的翻译进度条。
    3.  翻译完成后，每个英文段落下方会出现带有紫色左边框的中文译文。
    4.  点击页面右上角的控制面板上的"移除译文"可一键清除所有翻译内容。

## 🔧 技术栈

*   **前端框架**: React 18
*   **构建工具**: Vite
*   **样  式**: TailwindCSS
*   **UI 组件**: Lucide React Icons
*   **AI 模型**: Google Gemini API (通过 `@google/generative-ai` SDK)
*   **浏览器能力**: Chrome Extension Manifest V3 (Side Panel API, Scripting API)

## 📄 License

MIT License
