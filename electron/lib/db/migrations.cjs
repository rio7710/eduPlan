const MIGRATIONS = [
  `ALTER TABLE hierarchy_labels ADD COLUMN final_label TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sentence_edits ADD COLUMN left_context TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sentence_edits ADD COLUMN before_focus TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sentence_edits ADD COLUMN after_focus TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sentence_edits ADD COLUMN right_context TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE sentence_edits ADD COLUMN final_action TEXT NOT NULL DEFAULT ''`,
];

function runMigrations(db) {
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      // 이미 적용된 마이그레이션은 무시
    }
  }
}

module.exports = {
  runMigrations,
};
