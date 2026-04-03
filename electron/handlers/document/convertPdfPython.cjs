const fs = require('node:fs/promises');
const path = require('node:path');
const { parseJsonSafe } = require('../../lib/python/contracts.cjs');
const { runPythonScript, runPythonScriptStreaming } = require('../../lib/python/runner.cjs');
const { buildPdfTempPaths } = require('../../lib/convertPaths.cjs');
const { buildSentenceReviewItems } = require('./buildSentenceReviewItems.cjs');
const { upsertDocumentRecord } = require('./shared.cjs');

async function applyLineBreakModel(markdownPath, sensitivity) {
  const result = await runPythonScript('LightGBM_ML/apply_line_break_model.py', [
    '--markdown',
    markdownPath,
    '--sensitivity',
    sensitivity,
  ]);
  if (!result.ok) {
    return result.error || result.stderr || 'LightGBM 후처리 실패';
  }
  return null;
}

async function applyReferenceText(markdownPath, referencePath, replaceJsonPath) {
  const result = await runPythonScript('LightGBM_ML/apply_reference_text.py', [
    '--markdown',
    markdownPath,
    '--reference',
    referencePath,
    '--replace-json',
    replaceJsonPath,
  ]);
  if (!result.ok) {
    return { ok: false, error: result.error || result.stderr || '텍스트 기준 후처리 실패' };
  }
  return {
    ok: true,
    matchedSegments: Number(result.json?.matchedSegments || 0),
    candidate2LineCount: Number(result.json?.candidate2LineCount || 0),
    applied2LineCount: Number(result.json?.applied2LineCount || 0),
    chained2LineCount: Number(result.json?.chained2LineCount || 0),
    replaceCount: Number(result.json?.replaceCount || 0),
    referenceChars: Number(result.json?.referenceChars || 0),
  };
}

function stripStandaloneImageLabelLines(markdownText) {
  const lines = String(markdownText || '').split(/\r?\n/);
  // Keep valid image references like "[이미지 1: image/foo.png]".
  // Only remove malformed placeholders that do not point to image/ path.
  const validImageRefLineRe = /^\s*[.\-*\u25CB○]?\s*(?:\[\s*이미지\s+\d+:\s*image\/[^\]]+\]\s*)+$/i;
  const malformedImageRefLineRe = /^\s*[.\-*\u25CB○]?\s*(?:\[\s*이미지\s+\d+:\s*[^\]]*\]\s*)+$/;
  return lines
    .filter((line) => !(malformedImageRefLineRe.test(line) && !validImageRefLineRe.test(line)))
    .join('\n');
}

async function buildReferenceDiffReport(rawMarkdownPath, referencePath, outputPath, pdfStem) {
  const result = await runPythonScript('LightGBM_ML/build_reference_diff_report.py', [
    '--raw-markdown',
    rawMarkdownPath,
    '--reference',
    referencePath,
    '--output',
    outputPath,
    '--pdf-stem',
    pdfStem,
  ]);
  if (!result.ok) {
    return { ok: false, error: result.error || result.stderr || '페이지 기준 ML 레포트 생성 실패' };
  }
  return {
    ok: true,
    reportPath: String(result.json?.outputPath || outputPath),
    changedPages: Number(result.json?.changedPages || 0),
    pageCount: Number(result.json?.pageCount || 0),
    avgSimilarity: Number(result.json?.avgSimilarity || 0),
  };
}

function upsertTxtReferenceReplacements(db, markdownPath, fileName, replaceJsonPath) {
  let parsed = null;
  try {
    parsed = JSON.parse(require('node:fs').readFileSync(replaceJsonPath, 'utf8'));
  } catch {
    return 0;
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    return 0;
  }

  const now = new Date().toISOString();
  db.prepare(`
    DELETE FROM sentence_edits
    WHERE document_path = ? AND content_kind = 'txt_reference_replace'
  `).run(markdownPath);

  const insertStmt = db.prepare(`
    INSERT INTO sentence_edits (
      id, document_path, file_name, content_kind, action, change_type,
      line_start, line_end, original_text, edited_text, original_window, edited_window,
      left_context, before_focus, after_focus, right_context, diff_summary, quality_score,
      review_status, final_action, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let syntheticLineNo = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const before = String(item?.before || '').trim();
    const after = String(item?.after || '').trim();
    if (!before || !after || before === after) {
      continue;
    }
    syntheticLineNo += 1;
    const lineNo = Number(item?.page || syntheticLineNo);
    const itemId = `${markdownPath}:txt:${index + 1}`;
    insertStmt.run(
      itemId,
      markdownPath,
      fileName,
      'txt_reference_replace',
      'auto_replace',
      'replace',
      lineNo,
      lineNo,
      before,
      after,
      before,
      after,
      '',
      before,
      after,
      '',
      'TXT 기준 자동 보정 (2-line scoped)',
      0.99,
      'approved',
      'auto_txt_replace',
      now,
      now,
    );
    inserted += 1;
  }
  return inserted;
}

async function writeFinalMarkdown(pdfPath, pdfStem, markdownPath) {
  const finalMarkdownPath = path.join(path.dirname(pdfPath), `${pdfStem}.md`);
  const content = await fs.readFile(markdownPath, 'utf8');
  await fs.writeFile(finalMarkdownPath, content, 'utf8');
  return { finalMarkdownPath, content };
}

async function resolveFinalStageMarkdownPath(mdDir, pdfStem, fallbackPath) {
  let entries = [];
  try {
    entries = await fs.readdir(mdDir, { withFileTypes: true });
  } catch {
    return { markdownPath: fallbackPath, stage: 1 };
  }

  const stemSuffix = `_${String(pdfStem || '').toLowerCase()}.md`;
  let best = { markdownPath: fallbackPath, stage: 1 };
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const name = String(entry.name || '');
    if (!name.toLowerCase().endsWith(stemSuffix)) {
      continue;
    }
    const match = /^s(\d+)_/i.exec(name);
    if (!match) {
      continue;
    }
    const stage = Number(match[1] || 0);
    if (!Number.isFinite(stage) || stage <= best.stage) {
      continue;
    }
    best = {
      markdownPath: path.join(mdDir, name),
      stage,
    };
  }
  return best;
}

async function copyStageImages(finalMarkdownPath, imageDir) {
  const targetDir = path.join(path.dirname(finalMarkdownPath), 'image');
  await fs.mkdir(targetDir, { recursive: true });
  let entries = [];
  try {
    entries = await fs.readdir(imageDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let copied = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const sourcePath = path.join(imageDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    try {
      await fs.copyFile(sourcePath, targetPath);
      copied += 1;
    } catch {
      // ignore missing image files
    }
  }
  return copied;
}

async function flushProcessLog(logPath, payload) {
  try {
    await fs.writeFile(logPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore log write failure
  }
}

function registerConvertPdfPythonHandler(ipcMain, db) {
  ipcMain.handle('document:convert-pdf-python', async (_event, filePath, inferenceEngine = 'py_only', sensitivity = 'default') => {
    const absolutePdfPath = path.resolve(String(filePath || ''));
    if (!absolutePdfPath.toLowerCase().endsWith('.pdf')) {
      return { doc: null, reviewItems: [], error: 'pdf 파일 경로가 아닙니다.' };
    }

    const outputPaths = buildPdfTempPaths(absolutePdfPath);
    await fs.mkdir(outputPaths.mdDir, { recursive: true });
    await fs.mkdir(outputPaths.imgDir, { recursive: true });
    await fs.mkdir(outputPaths.layoutDir, { recursive: true });
    await fs.mkdir(outputPaths.reportDir, { recursive: true });
    const processLogPath = path.join(outputPaths.reportDir, 'ml_process_data.json');
    const processLog = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      pdfPath: absolutePdfPath,
      inferenceEngine,
      sensitivity,
      events: [],
      summary: {},
    };
    const recordProcess = (event, detail = {}) => {
      processLog.events.push({
        at: new Date().toISOString(),
        event,
        ...detail,
      });
    };
    const finalizeWithLog = async (payload) => {
      processLog.finishedAt = new Date().toISOString();
      processLog.summary = {
        ok: !payload?.error,
        error: payload?.error || null,
        txtReplaceCount: Number(payload?.txtReplaceCount || 0),
        reviewItemCount: Array.isArray(payload?.reviewItems) ? payload.reviewItems.length : 0,
      };
      recordProcess('finalize', processLog.summary);
      await flushProcessLog(processLogPath, processLog);
      if (!payload?.error) {
        try {
          await fs.unlink(processLogPath);
        } catch {
          // ignore cleanup failure
        }
      }
      return payload;
    };

    const counters = {
      replaceMatched: 0,
      replaceDetected: 0,
      pairAdded: 0,
      pairTotal: 0,
      autoApproved: 0,
    };
    const sendProgress = (payload) => {
      const withCounters = {
        ...payload,
        replaceMatched: counters.replaceMatched,
        replaceDetected: counters.replaceDetected,
        pairAdded: counters.pairAdded,
        pairTotal: counters.pairTotal,
        autoApproved: counters.autoApproved,
      };
      _event.sender.send('document:convert-progress', withCounters);
      recordProcess('progress', withCounters);
    };
    sendProgress({ stage: 'prepare', current: 0, total: 0, message: '변환 준비 중' });
    recordProcess('start', { message: 'pdf convert start' });

    const result = await runPythonScriptStreaming('pdf_to_md_pages.py', [absolutePdfPath, '-o', outputPaths.rootDir, '--extract-images', '--merged-only'], (line) => {
      const payload = parseJsonSafe(line);
      if (payload?.type === 'progress') {
        sendProgress(payload);
      }
    });
    if (!result.ok) {
      recordProcess('error', { stage: 'extract', message: result.error || result.stderr || 'python 실행 실패' });
      return await finalizeWithLog({ doc: null, reviewItems: [], error: result.error || result.stderr || 'python 실행 실패' });
    }

    const s01MarkdownPath = path.join(outputPaths.mdDir, `s01_${outputPaths.pdfStem}.md`);
    const finalStagePick = await resolveFinalStageMarkdownPath(
      outputPaths.mdDir,
      outputPaths.pdfStem,
      s01MarkdownPath,
    );
    const markdownPath = finalStagePick.markdownPath;
    const rawMarkdownPath = path.join(outputPaths.mdDir, `s01_${outputPaths.pdfStem}_raw.md`);
    const reportPath = path.join(outputPaths.reportDir, `s03_${outputPaths.pdfStem}_report.md`);
    const mlReportPath = path.join(outputPaths.reportDir, `s04_${outputPaths.pdfStem}_ml_report.json`);
    const replaceJsonPath = path.join(outputPaths.reportDir, `s04_${outputPaths.pdfStem}_replace_events.json`);
    const referenceTextPath = path.join(path.dirname(absolutePdfPath), `${outputPaths.pdfStem}.txt`);
    try {
      let usedReferenceText = false;
      let hasReferenceText = false;
      let latestMlReportPath = '';
      let txtReplaceCount = 0;

      recordProcess('stage_selected', {
        markdownPath,
        stage: finalStagePick.stage,
      });
      await fs.copyFile(markdownPath, rawMarkdownPath);
      recordProcess('artifact', { kind: 'raw_markdown', path: rawMarkdownPath });

      try {
        await fs.access(referenceTextPath);
        hasReferenceText = true;
        recordProcess('reference_detected', { referencePath: referenceTextPath });
        sendProgress({ stage: 'review', current: 0, total: 1, message: '텍스트 원문 기준 정렬 중' });
        const referenceResult = await applyReferenceText(markdownPath, referenceTextPath, replaceJsonPath);
        if (!referenceResult.ok) {
          console.warn('[pdf-convert] reference text refinement skipped:', referenceResult.error);
          recordProcess('reference_apply_skipped', { error: referenceResult.error });
        } else {
          usedReferenceText = referenceResult.matchedSegments > 0;
          counters.replaceMatched = referenceResult.applied2LineCount || referenceResult.matchedSegments;
          counters.replaceDetected = referenceResult.replaceCount;
          recordProcess('reference_applied', {
            matchedSegments: referenceResult.matchedSegments,
            candidate2LineCount: referenceResult.candidate2LineCount,
            applied2LineCount: referenceResult.applied2LineCount,
            chained2LineCount: referenceResult.chained2LineCount,
            replaceCount: referenceResult.replaceCount,
            referenceChars: referenceResult.referenceChars,
            replaceJsonPath,
          });
          try {
            const normalizedMarkdown = await fs.readFile(markdownPath, 'utf8');
            const strippedMarkdown = stripStandaloneImageLabelLines(normalizedMarkdown);
            if (strippedMarkdown !== normalizedMarkdown) {
              await fs.writeFile(markdownPath, strippedMarkdown, 'utf8');
              recordProcess('image_label_stripped', { changed: true });
            }
          } catch (stripError) {
            console.warn('[pdf-convert] image label strip skipped:', String(stripError?.message || stripError));
            recordProcess('image_label_strip_skipped', { error: String(stripError?.message || stripError) });
          }
          sendProgress({
            stage: 'review',
            current: referenceResult.applied2LineCount || referenceResult.matchedSegments,
            total: referenceResult.candidate2LineCount || referenceResult.referenceChars,
            message: `TXT 2행 보정 ${referenceResult.applied2LineCount || referenceResult.matchedSegments}/${referenceResult.candidate2LineCount || 0} (연쇄 ${referenceResult.chained2LineCount || 0})`,
          });
        }
        recordProcess('pair_append_skipped', { reason: 'manual_training_only' });
        const reportResult = await buildReferenceDiffReport(
          rawMarkdownPath,
          referenceTextPath,
          mlReportPath,
          outputPaths.pdfStem,
        );
        if (!reportResult.ok) {
          console.warn('[pdf-convert] reference diff report skipped:', reportResult.error);
          recordProcess('ml_report_skipped', { error: reportResult.error });
        } else {
          latestMlReportPath = reportResult.reportPath;
          recordProcess('ml_report_built', {
            path: latestMlReportPath,
            changedPages: reportResult.changedPages,
            pageCount: reportResult.pageCount,
            avgSimilarity: reportResult.avgSimilarity,
          });
          sendProgress({
            stage: 'review',
            current: reportResult.changedPages,
            total: reportResult.pageCount,
            message: `ML 레포트 ${reportResult.changedPages}/${reportResult.pageCount} 페이지`,
          });
        }
      } catch {
        // No sibling text reference. Keep extracted markdown as-is.
        recordProcess('reference_missing', { referencePath: referenceTextPath });
      }

      if (inferenceEngine === 'py_lgbm') {
        sendProgress({
          stage: 'review',
          current: hasReferenceText ? 1 : 0,
          total: 1,
          message: hasReferenceText ? '원문 정렬 후 프로세서 적용 중' : '프로세서 적용 중',
        });
        const mlError = await applyLineBreakModel(markdownPath, String(sensitivity || 'default'));
        if (mlError) {
          recordProcess('error', { stage: 'lgbm', message: mlError });
          return await finalizeWithLog({ doc: null, reviewItems: [], error: mlError });
        }
        recordProcess('lgbm_applied', { sensitivity: String(sensitivity || 'default') });
      }

      sendProgress({ stage: 'review', current: 1, total: 2, message: '최종 문서 저장 중' });
      const { finalMarkdownPath, content } = await writeFinalMarkdown(
        absolutePdfPath,
        outputPaths.pdfStem,
        markdownPath,
      );
      const copiedImages = await copyStageImages(finalMarkdownPath, outputPaths.imgDir);
      recordProcess('images_copied', { copiedImages, targetDir: path.join(path.dirname(finalMarkdownPath), 'image') });
      sendProgress({ stage: 'review', current: copiedImages, total: copiedImages, message: `이미지 ${copiedImages}건 복사` });
      const doc = upsertDocumentRecord(db, {
        filePath: finalMarkdownPath,
        fileName: path.basename(finalMarkdownPath),
        content,
        markSaved: true,
      });
      sendProgress({ stage: 'review', current: 1, total: 1, message: '리뷰 항목 생성 중' });
      const reviewItems = usedReferenceText
        ? []
        : buildSentenceReviewItems({
          markdownPath: finalMarkdownPath,
          sourcePdfPath: absolutePdfPath,
          markdownContent: content,
        });
      const autoInserted = upsertTxtReferenceReplacements(
        db,
        finalMarkdownPath,
        path.basename(finalMarkdownPath),
        replaceJsonPath,
      );
      recordProcess('txt_auto_inserted', { autoInserted, replaceJsonPath });
      if (autoInserted > 0) {
        counters.autoApproved = autoInserted;
        sendProgress({
          stage: 'review',
          current: autoInserted,
          total: autoInserted,
          message: `TXT 자동 승인 ${autoInserted}건 저장`,
        });
      }
      if (autoInserted > 0) {
        txtReplaceCount = autoInserted;
      }
      try {
        await fs.unlink(replaceJsonPath);
        recordProcess('replace_json_deleted', { path: replaceJsonPath, deleted: true });
      } catch {
        // ignore cleanup failure
        recordProcess('replace_json_deleted', { path: replaceJsonPath, deleted: false });
      }
      sendProgress({ stage: 'done', current: 1, total: 1, message: '변환 완료' });
      return await finalizeWithLog({ doc, reviewItems, reportPath, mlReportPath: latestMlReportPath || undefined, txtReplaceCount, processLogPath: null });
    } catch (error) {
      recordProcess('error', { stage: 'finalize', message: String(error?.message || error) });
      return await finalizeWithLog({ doc: null, reviewItems: [], error: String(error?.message || error), processLogPath });
    }
  });
}

module.exports = {
  registerConvertPdfPythonHandler,
};
