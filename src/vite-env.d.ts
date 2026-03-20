/// <reference types="vite/client" />

interface ShellDocument {
  id: string;
  fileName: string;
  filePath: string;
  content: string;
  blockCount: number;
  lastOpenedAt: string | null;
  lastSavedAt: string | null;
}

interface SaveDocumentPayload {
  filePath?: string;
  fileName: string;
  content: string;
}

interface SaveDocumentResult {
  doc: ShellDocument | null;
  editPatchCount: number;
  reviewItems: ReviewItem[];
}

interface FolderEntry {
  id: string;
  name: string;
  path: string;
  ext: string;
  kind: string;
  size: string;
  selected: boolean;
}

interface OpenFolderResult {
  path: string;
  includeSubfolders?: boolean;
  files: FolderEntry[];
}

interface FolderSearchMatch {
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineText: string;
  start: number;
  end: number;
}

interface FolderReplaceResult {
  changedFiles: ShellDocument[];
  changedFileCount: number;
  replacementCount: number;
}

interface LogoReviewItem {
  id: string;
  type: 'logo_candidate';
  sourcePdfName: string;
  sourcePdfPath: string;
  markdownPath: string;
  reviewDir: string;
  previewImagePath: string;
  candidateCount: number;
  memberPaths: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  recommendationSource?: 'PY' | 'ML' | 'ML&PY';
  pyScore?: number | null;
  mlScore?: number | null;
  pyLabel?: 'delete' | 'keep' | null;
  mlLabel?: 'delete' | 'keep' | null;
}

interface HierarchyPatternReviewItem {
  id: string;
  type: 'hierarchy_pattern';
  sourcePdfName: string;
  sourcePdfPath: string;
  markdownPath: string;
  reviewDir: string;
  previewImagePath: string;
  candidateCount: number;
  memberPaths: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  patternKind: 'fixed_section' | 'numeric_heading' | 'symbol_heading' | 'repeated_header';
  candidateText: string;
  recommendationLabel: string;
  finalLabel?: string;
  sampleTexts: string[];
  sampleLines: number[];
}

interface SentenceEditReviewItem {
  id: string;
  type: 'sentence_edit';
  sourcePdfName: string;
  sourcePdfPath: string;
  markdownPath: string;
  reviewDir: string;
  previewImagePath: string;
  candidateCount: number;
  memberPaths: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  editType: string;
  contentKind: string;
  action: string;
  qualityScore: number;
  lineStart: number;
  lineEnd: number;
  leftContext: string;
  beforeFocus: string;
  afterFocus: string;
  rightContext: string;
  originalText: string;
  editedText: string;
  originalWindow: string;
  editedWindow: string;
  diffSummary: string;
  finalAction?: string;
}

type ReviewItem = LogoReviewItem | HierarchyPatternReviewItem | SentenceEditReviewItem;

interface PdfConversionResult {
  doc: ShellDocument | null;
  reviewItems: LogoReviewItem[];
  error?: string;
}

interface MlDatasetRunSummary {
  name: string;
  path: string;
  totalSizeBytes: number;
  usedImageCount: number;
  reviewFileCount: number;
  updatedAt: string | null;
}

interface MlDatasetStats {
  rootPath: string;
  exists: boolean;
  totalSizeBytes: number;
  imageCount: number;
  labelsCount: number;
  featureRowCount: number;
  runCount: number;
  usedImageCount: number;
  reviewFileCount: number;
  runs: MlDatasetRunSummary[];
}

interface MlDatasetActionResult {
  ok: boolean;
  path?: string;
  zipPath?: string;
  removedDirCount?: number;
  freedBytes?: number;
  action?: 'upload' | 'cancel';
  error?: string;
}

interface SyncStatus {
  sqliteConnected: boolean;
  pendingCount: number;
  ollamaAvailable: boolean;
  externalApiLabel: string;
}

interface Window {
  eduFixerApi?: {
    getShellState: () => Promise<{ isDesktop: boolean; recentDocuments: ShellDocument[] }>;
    getSystemFonts: () => Promise<string[]>;
    getSyncStatus: () => Promise<SyncStatus>;
    filterExistingPaths: (paths: string[]) => Promise<string[]>;
    readImageDataUrl: (filePath: string) => Promise<string | null>;
    openFile: () => Promise<ShellDocument | null>;
    openFolder: () => Promise<OpenFolderResult | null>;
    openFolderPath: (folderPath: string, includeSubfolders?: boolean) => Promise<OpenFolderResult | null>;
    openRecent: (filePath: string) => Promise<ShellDocument | null>;
    convertPdfWithPython: (filePath: string, inferenceEngine?: 'py_only' | 'py_lgbm', sensitivity?: 'low' | 'default' | 'high') => Promise<PdfConversionResult | null>;
    analyzeHierarchyPatterns: (markdownPath: string) => Promise<HierarchyPatternReviewItem[]>;
    getMlDatasetStats: () => Promise<MlDatasetStats>;
    openMlDatasetRoot: () => Promise<MlDatasetActionResult>;
    exportMlDatasetZip: () => Promise<MlDatasetActionResult>;
    cleanupMlDatasetArtifacts: () => Promise<MlDatasetActionResult>;
    confirmMlDatasetResetFlow: () => Promise<MlDatasetActionResult>;
    deleteDocumentPath: (filePath: string) => Promise<{ ok: boolean; filePath?: string }>;
    scanLogoReviewItems: (folderPath: string, inferenceEngine?: 'py_only' | 'py_lgbm') => Promise<LogoReviewItem[]>;
    getSentenceReviewItems: () => Promise<SentenceEditReviewItem[]>;
    resolveHierarchyReviewItem: (payload: {
      id: string;
      markdownPath: string;
      patternKind: HierarchyPatternReviewItem['patternKind'];
      candidateText: string;
      recommendationLabel: string;
      finalLabel?: string;
      sampleTexts: string[];
      sampleLines: number[];
      action: 'approve' | 'reject';
    }) => Promise<{ ok: boolean; error?: string; doc?: ShellDocument | null }>;
    resolveSentenceReviewItem: (payload: {
      id: string;
      action: 'approve' | 'reject';
    }) => Promise<{ ok: boolean; error?: string }>;
    resolveLogoReviewItem: (payload: {
      id: string;
      sourcePdfName: string;
      sourcePdfPath: string;
      markdownPath: string;
      reviewDir: string;
      candidateCount: number;
      memberPaths: string[];
      action: 'approve' | 'reject';
    }) => Promise<{ ok: boolean; finalized?: boolean; centralDir?: string }>;
    saveDocument: (payload: SaveDocumentPayload) => Promise<SaveDocumentResult | null>;
    saveDocumentAs: (payload: SaveDocumentPayload) => Promise<SaveDocumentResult | null>;
    searchInFolder: (payload: { folderPath: string; query: string }) => Promise<FolderSearchMatch[]>;
    replaceInFolder: (payload: { folderPath: string; query: string; replaceValue: string }) => Promise<FolderReplaceResult>;
    writeClipboard: (payload: { plain: string; html?: string }) => void;
    minimizeWindow: () => Promise<void>;
    maximizeToggle: () => Promise<boolean>;
    closeWindow: () => Promise<void>;
  };
}
