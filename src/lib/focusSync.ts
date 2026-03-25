export type FocusOwner = 'editor' | 'render' | 'search' | 'md-menu' | 'none';

export type FocusSearchSelection = {
  filePath?: string;
  lineNumber: number;
  start: number;
  end: number;
  query: string;
};

export type FocusSyncState = {
  owner: FocusOwner;
  searchSelection: FocusSearchSelection | null;
};

export function createInitialFocusSyncState(): FocusSyncState {
  return {
    owner: 'none',
    searchSelection: null,
  };
}

export function requestSearchFocus(selection: FocusSearchSelection): FocusSyncState {
  return {
    owner: 'search',
    searchSelection: selection,
  };
}

export function requestMenuFocus(): FocusSyncState {
  return {
    owner: 'md-menu',
    searchSelection: null,
  };
}

export function requestPreviewFocus(current: FocusSyncState): FocusSyncState {
  if (current.owner === 'render' && !current.searchSelection) {
    return current;
  }

  return {
    owner: 'render',
    searchSelection: null,
  };
}

export function requestEditorFocus(current: FocusSyncState): FocusSyncState {
  if (current.owner === 'editor' && !current.searchSelection) {
    return current;
  }

  return {
    owner: 'editor',
    searchSelection: null,
  };
}

export function getSearchPanelSelection(current: FocusSyncState): FocusSearchSelection | null {
  return current.owner === 'search' ? current.searchSelection : null;
}

export function getFocusOwnerLabel(owner: FocusOwner): string {
  if (owner === 'editor') {
    return '에디터';
  }
  if (owner === 'render') {
    return 'Render';
  }
  if (owner === 'search') {
    return '검색';
  }
  if (owner === 'md-menu') {
    return '메뉴';
  }
  return '없음';
}
