import { getFileIcon, getFileIconClass } from '@/utils/fileIcon';

type Props = {
  onOpenUpload: () => void;
  onOpenEditor: () => void;
  onOpenReview: () => void;
  recentDocuments: ShellDocument[];
  onOpenRecent: (doc: ShellDocument) => void;
};

export function WelcomeView({ onOpenUpload, onOpenEditor, onOpenReview, recentDocuments, onOpenRecent }: Props) {
  return (
    <div className="welcome-content">
      <div className="welcome-hero">
        <div className="welcome-logo">📚</div>
        <h1>eduPlan</h1>
        <p className="welcome-sub">PDF 기반 교육안 작성 도구</p>
      </div>

      <div className="welcome-actions">
        <button className="welcome-btn" onClick={onOpenUpload}>
          <span className="welcome-btn-icon">📎</span>
          <div>
            <div className="welcome-btn-title">PDF 업로드</div>
            <div className="welcome-btn-desc">새 PDF를 불러와 교육안으로 변환</div>
          </div>
        </button>
        <button className="welcome-btn" onClick={onOpenEditor}>
          <span className="welcome-btn-icon">📄</span>
          <div>
            <div className="welcome-btn-title">최근 문서 열기</div>
            <div className="welcome-btn-desc">2024 1학기 수업계획서.md</div>
          </div>
        </button>
        <button className="welcome-btn" onClick={onOpenReview}>
          <span className="welcome-btn-icon">✅</span>
          <div>
            <div className="welcome-btn-title">ML 데이터 검토</div>
            <div className="welcome-btn-desc">검토 대기 12건</div>
          </div>
        </button>
      </div>

      <div className="welcome-recent">
        <h3>최근 문서</h3>
        <div className="recent-list">
          {recentDocuments.length ? recentDocuments.map((doc, index) => (
            <div key={doc.id} className="recent-item" onClick={() => onOpenRecent(doc)}>
              <span className={`recent-icon ${getFileIconClass(doc.fileName)}`}>{getFileIcon(doc.fileName)}</span>
              <div className="recent-info">
                <div className="recent-name">{doc.fileName}</div>
                <div className="recent-meta">{`${doc.lastOpenedAt?.slice(0, 10) ?? '최근'} · 블록 ${doc.blockCount}개`}</div>
              </div>
              <span className={`recent-badge ${index === 0 ? 'synced' : 'pending'}`}>{index === 0 ? '동기화됨' : '동기화 대기'}</span>
            </div>
          )) : (
            <div className="recent-item">
              <span className="recent-icon">📄</span>
              <div className="recent-info">
                <div className="recent-name">최근 문서 없음</div>
                <div className="recent-meta">파일을 열면 여기에 표시됩니다.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
