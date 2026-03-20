import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

interface WysiwygPaneProps {
  content: string;
  scrollRequest?: { line: number; token: number } | null;
  onChange: (markdownText: string) => void;
}

const turndown = new TurndownService();

marked.setOptions({
  breaks: true,
  gfm: true,
});

function extractHeadingLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => (line.match(/^(#{1,6})\s+(.+)$/) ? index + 1 : null))
    .filter((line): line is number => Boolean(line));
}

export function WysiwygPane({ content, scrollRequest = null, onChange }: WysiwygPaneProps) {
  const initialHtml = DOMPurify.sanitize(marked.parse(content) as string);
  const headingLines = extractHeadingLines(content);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'wysiwyg-editor',
      },
    },
    onUpdate: ({ editor: tiptapEditor }) => {
      onChange(turndown.turndown(tiptapEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const nextHtml = DOMPurify.sanitize(marked.parse(content) as string);
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const headings = editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
      const lineNumber = headingLines[index];
      if (lineNumber) {
        (heading as HTMLElement).id = `md-heading-line-${lineNumber}`;
      }
    });
  }, [editor, headingLines, content]);

  useEffect(() => {
    if (!editor || !scrollRequest) {
      return;
    }
    const target = editor.view.dom.querySelector<HTMLElement>(`#md-heading-line-${scrollRequest.line}`);
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
      editor.commands.focus();
    }
  }, [editor, scrollRequest]);

  return <EditorContent editor={editor} />;
}
