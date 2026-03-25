import { DelayedTooltip } from '@/components/ui/DelayedTooltip';
import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Tab = {
  id: string;
  label: string;
  icon: string;
};

type Props = {
  tabs: Tab[];
  activeTab: string;
  onPressTab?: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

export function TabsBar({ tabs, activeTab, onPressTab, onSelectTab, onCloseTab }: Props) {
  return (
    <div className="tabbar" id="tabbar">
      <div className="tabbar-track">
        {tabs.map((tab) => (
          <DelayedTooltip key={tab.id} content={tab.label}>
            <button
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onMouseDown={() => onPressTab?.(tab.id)}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className={`tab-icon ${getFileIconClass(tab.label)}`}>{getFileIcon(tab.label)}</span>
              <span className="tab-label">{tab.label}</span>
              {tab.id !== 'welcome' ? (
                <span
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          </DelayedTooltip>
        ))}
      </div>
    </div>
  );
}
