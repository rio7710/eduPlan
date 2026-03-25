function getBaseSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      block_count INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      last_saved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hierarchy_candidates (
      id TEXT PRIMARY KEY,
      markdown_path TEXT NOT NULL,
      pattern_kind TEXT NOT NULL,
      candidate_text TEXT NOT NULL,
      recommendation_label TEXT NOT NULL,
      sample_lines_json TEXT NOT NULL,
      sample_texts_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hierarchy_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      pattern_kind TEXT NOT NULL,
      candidate_text TEXT NOT NULL,
      final_action TEXT NOT NULL,
      final_label TEXT NOT NULL DEFAULT '',
      recommendation_label TEXT NOT NULL,
      sample_lines_json TEXT NOT NULL,
      sample_texts_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edit_patches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      original_text TEXT NOT NULL,
      edited_text TEXT NOT NULL,
      original_window TEXT NOT NULL,
      edited_window TEXT NOT NULL,
      diff_summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentence_edits (
      id TEXT PRIMARY KEY,
      document_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_kind TEXT NOT NULL,
      action TEXT NOT NULL,
      change_type TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      original_text TEXT NOT NULL,
      edited_text TEXT NOT NULL,
      original_window TEXT NOT NULL,
      edited_window TEXT NOT NULL,
      left_context TEXT NOT NULL DEFAULT '',
      before_focus TEXT NOT NULL DEFAULT '',
      after_focus TEXT NOT NULL DEFAULT '',
      right_context TEXT NOT NULL DEFAULT '',
      diff_summary TEXT NOT NULL,
      quality_score REAL NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'pending',
      final_action TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logo_reviews (
      id TEXT PRIMARY KEY,
      source_pdf_name TEXT NOT NULL,
      source_pdf_path TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      review_dir TEXT NOT NULL,
      preview_image_path TEXT NOT NULL DEFAULT '',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      member_paths_json TEXT NOT NULL,
      recommendation_source TEXT,
      py_score REAL,
      ml_score REAL,
      py_label TEXT,
      ml_label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      final_action TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
}

module.exports = {
  getBaseSchemaSql,
};
