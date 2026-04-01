import { useEffect, useMemo, useState } from 'react';
import {
  defaultFontSettings,
  fontFamilyOptions,
  resolveFontColor,
  themeAwareAutoColorToken,
  type FontSettings,
  type FontToken,
} from '@/lib/fontSettings';

type Props = {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  fontSettings: FontSettings;
  onChangeFontSettings: (settings: FontSettings) => void;
  onResetFontSettings: () => void;
};

type SettingsTab = 'general' | 'fonts';

type FontControlProps = {
  label: string;
  value: FontToken;
  theme: 'dark' | 'light';
  fontOptions: string[];
  onChange: (next: FontToken) => void;
};

const colorPalette = [
  { label: '자동', value: themeAwareAutoColorToken, swatchClassName: 'is-auto' },
  { label: '빨강', value: 'theme:red' },
  { label: '주황', value: 'theme:orange' },
  { label: '노랑', value: 'theme:yellow' },
  { label: '초록', value: 'theme:green' },
  { label: '하늘', value: 'theme:sky' },
  { label: '파랑', value: 'theme:blue' },
  { label: '보라', value: 'theme:purple' },
];

function FontControl({ label, value, theme, fontOptions, onChange }: FontControlProps) {
  const datalistId = `font-family-options-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const resolvedColor = resolveFontColor(value.color, theme);
  const [colorModalOpen, setColorModalOpen] = useState(false);
  const isAutoColor = value.color === themeAwareAutoColorToken;

  return (
    <div className="font-token-card">
      <div className="font-token-header">
        <strong>{label}</strong>
        <span
          className="font-token-preview"
          style={{
            fontFamily: value.fontFamily,
            fontSize: `${value.fontSize}px`,
            color: resolvedColor,
          }}
        >
          샘플 텍스트
        </span>
      </div>
      <div className="font-token-grid one-line">
        <label className="font-field">
          <span>폰트</span>
          <>
            <input
              list={datalistId}
              className="settings-input"
              value={value.fontFamily.replaceAll('"', '')}
              onChange={(event) => onChange({ ...value, fontFamily: event.target.value })}
              placeholder="시스템 폰트 이름 입력"
            />
            <datalist id={datalistId}>
              {fontOptions.map((fontFamily) => (
                <option key={fontFamily} value={fontFamily.replaceAll('"', '')} />
              ))}
            </datalist>
          </>
        </label>
        <label className="font-field">
          <span>크기</span>
          <input
            type="number"
            min={10}
            max={48}
            className="settings-input"
            value={value.fontSize}
            onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) || 12 })}
          />
        </label>
        <label className="font-field">
          <span>컬러</span>
          <button
            type="button"
            className="font-color-trigger"
            onClick={() => setColorModalOpen(true)}
            aria-label={`${label} 컬러 선택`}
          >
            <span className="font-color-trigger-swatch">
              <span
                className={`font-color-swatch-display ${isAutoColor ? 'is-auto' : ''}`.trim()}
                style={
                  isAutoColor
                    ? undefined
                    : { backgroundColor: resolvedColor }
                }
              />
            </span>
          </button>

          {colorModalOpen ? (
            <div className="font-color-modal-backdrop" onClick={() => setColorModalOpen(false)}>
              <div className="font-color-modal" onClick={(event) => event.stopPropagation()}>
                <div className="font-color-modal-header">
                  <strong>{label} 컬러</strong>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColorModalOpen(false)}>
                    닫기
                  </button>
                </div>
                <div className="font-color-palette" role="listbox" aria-label={`${label} 컬러 팔레트`}>
                  {colorPalette.map((colorOption) => {
                    const isSelected = value.color.toLowerCase() === colorOption.value.toLowerCase();
                    const swatchColor = resolveFontColor(colorOption.value, theme);

                    return (
                      <button
                        key={`${label}-${colorOption.value}`}
                        type="button"
                        title={colorOption.label}
                        aria-label={colorOption.label}
                        aria-selected={isSelected}
                        className={`font-color-swatch ${isSelected ? 'active' : ''} ${colorOption.swatchClassName ?? ''}`.trim()}
                        style={colorOption.swatchClassName ? undefined : { backgroundColor: swatchColor }}
                        onClick={() => {
                          onChange({
                            ...value,
                            color: colorOption.value,
                          });
                          setColorModalOpen(false);
                        }}
                      >
                        <span className="font-color-swatch-name">{colorOption.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </label>
      </div>
    </div>
  );
}

export function SettingsView({ theme, onToggleTheme, fontSettings, onChangeFontSettings, onResetFontSettings }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  useEffect(() => {
    window.eduFixerApi?.getSystemFonts?.().then((fonts) => {
      if (!fonts?.length) {
        return;
      }
      setSystemFonts(fonts);
    }).catch(() => {
      // keep fallback list only
    });
  }, []);

  const fontOptions = useMemo(() => {
    return Array.from(new Set([...fontFamilyOptions, ...systemFonts]));
  }, [systemFonts]);

  return (
    <>
      <div className="view-header"><span className="breadcrumb">설정</span></div>
      <div className="settings-content">
        <div className="settings-tabbar">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            일반 설정
          </button>
          <button
            className={`settings-tab ${activeTab === 'fonts' ? 'active' : ''}`}
            onClick={() => setActiveTab('fonts')}
          >
            폰트 설정
          </button>
        </div>

        {activeTab === 'general' ? (
          <>
            <div className="settings-section">
              <div className="settings-section-title">AI 모델 설정</div>
              <div className="settings-row">
                <label className="settings-label">기본 후처리 AI</label>
                <select className="settings-select">
                  <option>로컬 (Ollama) - 권장</option>
                  <option>Claude API</option>
                  <option>GPT API</option>
                </select>
              </div>
              <div className="settings-row">
                <label className="settings-label">Claude API 키</label>
                <div className="settings-input-row">
                  <input type="password" className="settings-input" defaultValue="sk-ant-••••••••••••••••" />
                  <button className="btn btn-ghost btn-sm">테스트</button>
                  <button className="btn btn-ghost btn-sm">삭제</button>
                </div>
              </div>
              <div className="settings-row">
                <label className="settings-label">GPT API 키</label>
                <div className="settings-input-row">
                  <input type="password" className="settings-input" placeholder="sk-..." />
                  <button className="btn btn-ghost btn-sm">테스트</button>
                  <button className="btn btn-ghost btn-sm">삭제</button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">동기화 설정</div>
              <div className="settings-row">
                <label className="settings-label">자동 동기화 간격</label>
                <select className="settings-select">
                  <option>30분</option>
                  <option>15분</option>
                  <option>1시간</option>
                  <option>수동만</option>
                </select>
              </div>
              <div className="settings-row">
                <label className="settings-label">수정 누적 자동 동기화</label>
                <select className="settings-select">
                  <option>10개</option>
                  <option>5개</option>
                  <option>20개</option>
                  <option>사용 안 함</option>
                </select>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">팀 설정</div>
              <div className="settings-row">
                <label className="settings-label">서버 주소</label>
                <input type="text" className="settings-input" defaultValue="https://api.eduplan.com" />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">UI 설정</div>
              <div className="settings-row">
                <label className="settings-label">테마</label>
                <div className="theme-setting-row">
                  <button className="btn btn-ghost" id="theme-toggle-btn" onClick={onToggleTheme}>
                    <span className="theme-toggle-icon" id="theme-toggle-icon">{theme === 'light' ? '☀️' : '🌙'}</span>
                    <span id="theme-toggle-text">{theme === 'light' ? '라이트 모드' : '다크 모드'}</span>
                  </button>
                  <span className="settings-help-text">라이트/다크 모드 전환</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="settings-section">
              <div className="settings-section-title">헤더 폰트 설정</div>
              <div className="font-settings-body">
                <FontControl
                  label="H1"
                  value={fontSettings.headings.h1}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h1: next } })}
                />
                <FontControl
                  label="H2"
                  value={fontSettings.headings.h2}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h2: next } })}
                />
                <FontControl
                  label="H3"
                  value={fontSettings.headings.h3}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h3: next } })}
                />
                <FontControl
                  label="H4"
                  value={fontSettings.headings.h4}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h4: next } })}
                />
                <FontControl
                  label="H5"
                  value={fontSettings.headings.h5}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h5: next } })}
                />
                <FontControl
                  label="H6"
                  value={fontSettings.headings.h6}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, headings: { ...fontSettings.headings, h6: next } })}
                />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">블릿 폰트 설정</div>
              <div className="font-settings-body">
                <FontControl
                  label="글머리표 목록"
                  value={fontSettings.bullets.unordered}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, bullets: { ...fontSettings.bullets, unordered: next } })}
                />
                <FontControl
                  label="번호 목록"
                  value={fontSettings.bullets.ordered}
                  theme={theme}
                  fontOptions={fontOptions}
                  onChange={(next) => onChangeFontSettings({ ...fontSettings, bullets: { ...fontSettings.bullets, ordered: next } })}
                />
              </div>
            </div>
          </>
        )}

        <div className="settings-footer">
          {activeTab === 'fonts' ? (
            <>
              <button className="btn btn-ghost" onClick={onResetFontSettings}>폰트 초기화</button>
              <button className="btn btn-ghost" onClick={() => onChangeFontSettings(defaultFontSettings)}>기본값 적용</button>
            </>
          ) : null}
          <button className="btn btn-primary">저장</button>
        </div>
      </div>
    </>
  );
}
