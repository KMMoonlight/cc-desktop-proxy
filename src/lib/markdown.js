import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const MARKDOWN_COPY_TEXT = {
  en: {
    copied: 'Copied',
    copy: 'Copy',
  },
  zh: {
    copied: '已复制',
    copy: '复制',
  },
};

const MARKDOWN_RENDER_CACHE_MAX_SIZE = 120;
const markdownRenderCache = new Map();

export function renderMarkdown(text = '', language = 'zh') {
  const normalizedText = typeof text === 'string' ? text : String(text ?? '');
  const cacheKey = `${language}\u0000${normalizedText}`;
  const cachedHtml = markdownRenderCache.get(cacheKey);
  if (typeof cachedHtml === 'string') {
    markdownRenderCache.delete(cacheKey);
    markdownRenderCache.set(cacheKey, cachedHtml);
    return cachedHtml;
  }

  const renderedHtml = marked.parse(normalizedText);
  const enhancedHtml = enhanceMarkdownHtml(renderedHtml, language);
  const sanitizedHtml = DOMPurify.sanitize(enhancedHtml);

  if (markdownRenderCache.size >= MARKDOWN_RENDER_CACHE_MAX_SIZE) {
    const oldestKey = markdownRenderCache.keys().next().value;
    if (oldestKey) {
      markdownRenderCache.delete(oldestKey);
    }
  }

  markdownRenderCache.set(cacheKey, sanitizedHtml);
  return sanitizedHtml;
}

function enhanceMarkdownHtml(html, language) {
  if (typeof document === 'undefined') {
    return html;
  }

  const copyText = MARKDOWN_COPY_TEXT[language] || MARKDOWN_COPY_TEXT.zh;
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('pre').forEach((preElement) => {
    wrapCopyTarget(preElement, 'code', copyText);
  });

  template.content.querySelectorAll('table').forEach((tableElement) => {
    wrapCopyTarget(tableElement, 'table', copyText);
  });

  return template.innerHTML;
}

function wrapCopyTarget(element, kind, copyText) {
  if (!element?.parentNode) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `markdown-copy-shell markdown-copy-shell-${kind}`;
  wrapper.setAttribute('data-markdown-copy-shell', 'true');
  wrapper.setAttribute('data-copy-kind', kind);

  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-copy-toolbar';

  const button = document.createElement('button');
  button.className = 'markdown-copy-button';
  button.setAttribute('type', 'button');
  button.setAttribute('data-markdown-copy-button', 'true');
  button.setAttribute('data-copy-default-label', copyText.copy);
  button.setAttribute('data-copy-success-label', copyText.copied);
  button.setAttribute('aria-label', copyText.copy);
  button.setAttribute('title', copyText.copy);
  toolbar.appendChild(button);

  element.parentNode.replaceChild(wrapper, element);
  wrapper.appendChild(toolbar);

  if (kind === 'table') {
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'markdown-copy-table-scroll';
    scrollContainer.appendChild(element);
    wrapper.appendChild(scrollContainer);
    return;
  }

  wrapper.appendChild(element);
}
