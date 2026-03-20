import type { PanelId } from '@/App';
import { DelayedTooltip } from '@/components/ui/DelayedTooltip';

type Props = {
  activePanel: PanelId;
  onSelectPanel: (panel: PanelId) => void;
  showMdMenu: boolean;
};

function iconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function iconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function iconMdMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 5h12v3H6zM6 10.5h12v3H6zM6 16h8v3H6z" />
    </svg>
  );
}

function iconReview() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}

function iconDataset() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5.5" rx="7" ry="3" />
      <path d="M5 5.5v5c0 1.657 3.134 3 7 3s7-1.343 7-3v-5" />
      <path d="M5 10.5v5c0 1.657 3.134 3 7 3s7-1.343 7-3v-5" />
    </svg>
  );
}

function iconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ActivityBar({ activePanel, onSelectPanel, showMdMenu }: Props) {
  return (
    <div className="activitybar">
      <div className="activity-group top">
        <DelayedTooltip content="File Explorer">
          <button className={`activity-btn ${activePanel === 'explorer' ? 'active' : ''}`} data-panel="explorer" onClick={() => onSelectPanel('explorer')}>
            {iconFolder()}
          </button>
        </DelayedTooltip>
        {showMdMenu ? (
          <DelayedTooltip content="MD 문서 메뉴">
            <button className={`activity-btn ${activePanel === 'md-menu' ? 'active' : ''}`} data-panel="md-menu" onClick={() => onSelectPanel('md-menu')}>
              {iconMdMenu()}
            </button>
          </DelayedTooltip>
        ) : null}
        <DelayedTooltip content="검색">
          <button className={`activity-btn ${activePanel === 'search' ? 'active' : ''}`} data-panel="search" onClick={() => onSelectPanel('search')}>
            {iconSearch()}
          </button>
        </DelayedTooltip>
        <DelayedTooltip content="ML 데이터 검토">
          <button className={`activity-btn ${activePanel === 'review' ? 'active' : ''}`} data-panel="review" onClick={() => onSelectPanel('review')}>
            {iconReview()}
          </button>
        </DelayedTooltip>
        <DelayedTooltip content="ML Dataset">
          <button className={`activity-btn ${activePanel === 'dataset' ? 'active' : ''}`} data-panel="dataset" onClick={() => onSelectPanel('dataset')}>
            {iconDataset()}
          </button>
        </DelayedTooltip>
      </div>
      <div className="activity-group bottom">
        <DelayedTooltip content="설정">
          <button className={`activity-btn ${activePanel === 'settings' ? 'active' : ''}`} data-panel="settings" onClick={() => onSelectPanel('settings')}>
            {iconSettings()}
          </button>
        </DelayedTooltip>
      </div>
    </div>
  );
}
