const { ipcMain } = require('electron');
const path = require('node:path');
const { getDb } = require('../lib/dbEngine.cjs');

function registerReviewHandlers(mainWindow) {
  const db = getDb();

  // 로고 검토 항목 스캔 (기존 main.cjs 로직 요약 이관)
  ipcMain.handle('review:scan-logo-items', async (_event, folderPath) => {
    const rows = db.prepare(`
      SELECT * FROM logo_reviews 
      WHERE status = 'pending' 
      ORDER BY created_at DESC
    `).all();

    return rows.map(row => ({
      id: row.id,
      type: 'logo_candidate',
      sourcePdfName: row.source_pdf_name,
      sourcePdfPath: row.source_pdf_path,
      markdownPath: row.markdown_path,
      reviewDir: row.review_dir,
      previewImagePath: row.preview_image_path,
      candidateCount: row.candidate_count,
      memberPaths: JSON.parse(row.member_paths_json || '[]'),
      recommendationSource: row.recommendation_source,
      pyScore: row.py_score,
      mlScore: row.ml_score,
      pyLabel: row.py_label,
      mlLabel: row.ml_label,
      status: row.status,
      createdAt: row.created_at,
    }));
  });

  // 문장 수정 제안 항목 조회
  ipcMain.handle('review:get-sentence-items', async () => {
    const rows = db.prepare(`
      SELECT * FROM sentence_edits 
      WHERE review_status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT 100
    `).all();

    return rows.map(row => ({
      id: row.id,
      type: 'sentence_edit',
      sourcePdfName: row.file_name,
      sourcePdfPath: row.document_path,
      createdAt: row.created_at,
      status: row.review_status,
      editType: row.change_type,
      contentKind: row.content_kind,
      action: row.action,
      qualityScore: row.quality_score,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      leftContext: row.left_context || '',
      beforeFocus: row.before_focus || '',
      afterFocus: row.after_focus || '',
      rightContext: row.right_context || '',
      originalText: row.original_text,
      editedText: row.edited_text,
      originalWindow: row.original_window,
      editedWindow: row.edited_window,
      diffSummary: row.diff_summary,
    }));
  });

  ipcMain.handle('review:resolve-sentence-item', async (_event, payload) => {
    const id = String(payload?.id || '');
    const action = payload?.action === 'approve' ? 'approved' : 'rejected';
    if (!id) return { ok: false, error: 'invalid_id' };
    db.prepare(`
      UPDATE sentence_edits
      SET review_status = ?, final_action = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(action, String(payload?.action || ''), id);
    return { ok: true };
  });

  ipcMain.handle('review:resolve-logo-item', async (_event, payload) => {
    const id = String(payload?.id || '');
    const action = payload?.action === 'approve' ? 'approved' : 'rejected';
    if (!id) return { ok: false, error: 'invalid_id' };

    db.prepare(`
      UPDATE logo_reviews
      SET status = ?, final_action = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(action, String(payload?.action || ''), id);

    const reviewDir = String(payload?.reviewDir || '');
    let finalized = false;
    if (reviewDir) {
      const row = db.prepare(`
        SELECT COUNT(*) AS pending_count
        FROM logo_reviews
        WHERE review_dir = ? AND status = 'pending'
      `).get(reviewDir);
      finalized = Number(row?.pending_count || 0) === 0;
    }

    return { ok: true, finalized, centralDir: '' };
  });

  ipcMain.handle('review:resolve-hierarchy-item', async (_event, payload) => {
    const id = String(payload?.id || '');
    const action = String(payload?.action || '');
    const finalLabel = String(payload?.finalLabel || payload?.final_label || '');

    if (!id) return { ok: false, error: 'invalid_id' };
    if (action === 'approve' && !finalLabel) {
      return { ok: false, error: 'final_label_required' };
    }

    db.prepare(`
      UPDATE hierarchy_candidates
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(action === 'approve' ? 'approved' : 'rejected', id);

    db.prepare(`
      INSERT INTO hierarchy_labels (
        candidate_id, markdown_path, pattern_kind, candidate_text, final_action, final_label,
        recommendation_label, sample_lines_json, sample_texts_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      String(payload?.markdownPath || ''),
      String(payload?.patternKind || ''),
      String(payload?.candidateText || ''),
      action,
      finalLabel,
      String(payload?.recommendationLabel || ''),
      JSON.stringify(payload?.sampleLines || []),
      JSON.stringify(payload?.sampleTexts || []),
    );

    return { ok: true, doc: null };
  });
}

module.exports = { registerReviewHandlers };
