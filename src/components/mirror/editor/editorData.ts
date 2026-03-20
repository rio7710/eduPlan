export const wysiwygBlocks = [
  { id: 'block-1', number: 1, badge: 'H', badgeClass: '', contentClass: 'heading-block', content: '2024학년도 1학기 수업 계획서' },
  { id: 'block-2', number: 2, badge: 'T', badgeClass: '', contentClass: 'text-block', content: '본 수업 계획서는 2024학년도 1학기 동안 진행될 교육 과정의 전반적인 내용을 담고 있습니다. 학생들의 학습 목표와 평가 기준을 명확히 하여 체계적인 교육을 실현하고자 합니다.' },
  { id: 'block-3', number: 3, badge: 'I', badgeClass: 'img', contentClass: 'image-block', content: '수업_구성도.png' },
  { id: 'block-4', number: 4, badge: 'TB', badgeClass: 'tbl', contentClass: 'table-block', content: 'table' },
  { id: 'block-5', number: 5, badge: 'T', badgeClass: '', contentClass: 'text-block', content: '평가 기준은 학습 목표 달성도(60%), 참여도(20%), 과제 완성도(20%)로 구성됩니다. 각 평가 항목은 학기 초에 학생들에게 공지하며, 이의 신청은 평가 후 1주일 이내에 가능합니다.' },
  { id: 'block-6', number: 6, badge: 'T', badgeClass: '', contentClass: 'text-block', content: '문의사항은 담당 교사에게 직접 연락하거나 학교 포털을 통해 접수하시기 바랍니다.' },
];

export const markdownBlocks = [
  { number: 1, badge: 'H', badgeClass: '', rows: 1, value: '# 2024학년도 1학기 수업 계획서' },
  { number: 2, badge: 'T', badgeClass: '', rows: 1, value: '본 수업 계획서는 2024학년도 1학기 동안 진행될 교육 과정의 전반적인 내용을 담고 있습니다. 학생들의 학습 목표와 평가 기준을 명확히 하여 체계적인 교육을 실현하고자 합니다.' },
  { number: 3, badge: 'I', badgeClass: 'img', rows: 1, value: '![수업_구성도](attachments/수업_구성도.png)' },
  { number: 4, badge: 'TB', badgeClass: 'tbl', rows: 6, value: `| 주차 | 단원 | 학습 목표 | 평가 |
| ---- | ---- | --------- | ---- |
| 1주  | 오리엔테이션 | 학습 목표 및 계획 이해 | - |
| 2주  | 기초 개념 | 핵심 개념 파악 | 형성평가 |
| 3주  | 심화 학습 | 응용 능력 향상 | 수행평가 |
| 4주  | 정리 및 평가 | 전체 내용 정리 | 총괄평가 |` },
  { number: 5, badge: 'T', badgeClass: '', rows: 1, value: '평가 기준은 학습 목표 달성도(60%), 참여도(20%), 과제 완성도(20%)로 구성됩니다. 각 평가 항목은 학기 초에 학생들에게 공지하며, 이의 신청은 평가 후 1주일 이내에 가능합니다.' },
  { number: 6, badge: 'T', badgeClass: '', rows: 1, value: '문의사항은 담당 교사에게 직접 연락하거나 학교 포털을 통해 접수하시기 바랍니다.' },
];

export const htmlBlocks = [
  { number: 1, badge: 'H', badgeClass: '', rows: 1, value: '<h1>2024학년도 1학기 수업 계획서</h1>' },
  { number: 2, badge: 'T', badgeClass: '', rows: 1, value: '<p>본 수업 계획서는 2024학년도 1학기 동안 진행될 교육 과정의 전반적인 내용을 담고 있습니다. 학생들의 학습 목표와 평가 기준을 명확히 하여 체계적인 교육을 실현하고자 합니다.</p>' },
  { number: 3, badge: 'I', badgeClass: 'img', rows: 3, value: `<figure>
  <img src="attachments/수업_구성도.png" alt="수업_구성도" />
</figure>` },
  { number: 4, badge: 'TB', badgeClass: 'tbl', rows: 11, value: `<table>
  <thead>
    <tr><th>주차</th><th>단원</th><th>학습 목표</th><th>평가</th></tr>
  </thead>
  <tbody>
    <tr><td>1주</td><td>오리엔테이션</td><td>학습 목표 및 계획 이해</td><td>-</td></tr>
    <tr><td>2주</td><td>기초 개념</td><td>핵심 개념 파악</td><td>형성평가</td></tr>
    <tr><td>3주</td><td>심화 학습</td><td>응용 능력 향상</td><td>수행평가</td></tr>
    <tr><td>4주</td><td>정리 및 평가</td><td>전체 내용 정리</td><td>총괄평가</td></tr>
  </tbody>
</table>` },
  { number: 5, badge: 'T', badgeClass: '', rows: 1, value: '<p>평가 기준은 학습 목표 달성도(60%), 참여도(20%), 과제 완성도(20%)로 구성됩니다. 각 평가 항목은 학기 초에 학생들에게 공지하며, 이의 신청은 평가 후 1주일 이내에 가능합니다.</p>' },
  { number: 6, badge: 'T', badgeClass: '', rows: 1, value: '<p>문의사항은 담당 교사에게 직접 연락하거나 학교 포털을 통해 접수하시기 바랍니다.</p>' },
];

export const previewBlocks = [
  { number: 1, badge: 'H', badgeClass: '', rows: 1, kind: 'heading', content: '2024학년도 1학기 수업 계획서' },
  { number: 2, badge: 'T', badgeClass: '', rows: 1, kind: 'text', content: '본 수업 계획서는 2024학년도 1학기 동안 진행될 교육 과정의 전반적인 내용을 담고 있습니다. 학생들의 학습 목표와 평가 기준을 명확히 하여 체계적인 교육을 실현하고자 합니다.' },
  { number: 3, badge: 'I', badgeClass: 'img', rows: 1, kind: 'image', content: '수업_구성도.png' },
  { number: 4, badge: 'TB', badgeClass: 'tbl', rows: 6, kind: 'table', content: 'table' },
  { number: 5, badge: 'T', badgeClass: '', rows: 1, kind: 'text', content: '평가 기준은 학습 목표 달성도(60%), 참여도(20%), 과제 완성도(20%)로 구성됩니다. 각 평가 항목은 학기 초에 학생들에게 공지하며, 이의 신청은 평가 후 1주일 이내에 가능합니다.' },
  { number: 6, badge: 'T', badgeClass: '', rows: 1, kind: 'text', content: '문의사항은 담당 교사에게 직접 연락하거나 학교 포털을 통해 접수하시기 바랍니다.' },
];
