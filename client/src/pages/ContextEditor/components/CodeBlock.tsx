import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language: string;
  children: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);
  
  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between bg-[#2d2d2d] px-3 py-1.5 rounded-t-lg border-b border-[#404040]">
        <span className="text-xs text-gray-400 font-mono">{language || 'text'}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: '0.5rem',
          borderBottomRightRadius: '0.5rem',
          fontSize: '12px',
          padding: '0.75rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};
