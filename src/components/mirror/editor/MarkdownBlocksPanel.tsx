import { markdownBlocks } from './editorData';
import { toMarkdownBlocks } from './contentTransforms';
import { SourceBlockRow } from './SourceBlockRow';

type Props = {
  document: ShellDocument | null;
};

export function MarkdownBlocksPanel({ document }: Props) {
  const blocks = document?.content ? toMarkdownBlocks(document.content) : markdownBlocks;

  return (
    <div className="editor-mode-panel active" id="panel-mode-markdown">
      <div className="source-block-list">
        {blocks.map((block) => (
          <SourceBlockRow key={`${block.number}-${block.badge}`} {...block} />
        ))}
      </div>
    </div>
  );
}
