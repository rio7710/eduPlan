import { htmlBlocks } from './editorData';
import { toHtmlBlocks } from './contentTransforms';
import { SourceBlockRow } from './SourceBlockRow';

type Props = {
  document: ShellDocument | null;
};

export function HtmlBlocksPanel({ document }: Props) {
  const blocks = document?.content ? toHtmlBlocks(document.content) : htmlBlocks;

  return (
    <div className="editor-mode-panel active" id="panel-mode-html">
      <div className="source-block-list">
        {blocks.map((block) => (
          <SourceBlockRow key={`${block.number}-${block.badge}`} {...block} />
        ))}
      </div>
    </div>
  );
}
