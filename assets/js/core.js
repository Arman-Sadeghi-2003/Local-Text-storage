/* ============================================
   core.js — Element references and shared application state.

   Loaded first: every other module reads `el` and `state` from here.
   ============================================ */

const $ = (id) => document.getElementById(id);

/** Kept in step with MIN_PASSWORD_LENGTH in api.php. */
const MIN_PASSWORD_LENGTH = 8;

const el = {
    modeIndicator: $('modeIndicator'),
    modeText: $('modeText'),
    themeToggle: $('themeToggle'),
    themeIcon: $('themeIcon'),
    logoutBtn: $('logoutBtn'),
    adminBtn: $('adminBtn'),

    authGate: $('authGate'),
    authForm: $('authForm'),
    authPassword: $('authPassword'),
    authError: $('authError'),
    authSubmit: $('authSubmit'),
    authLocalBtn: $('authLocalBtn'),

    setupGate: $('setupGate'),
    setupForm: $('setupForm'),
    setupPassword: $('setupPassword'),
    setupConfirm: $('setupConfirm'),
    setupError: $('setupError'),
    setupSubmit: $('setupSubmit'),
    setupLocalBtn: $('setupLocalBtn'),

    adminBackdrop: $('adminBackdrop'),
    adminCloseBtn: $('adminCloseBtn'),
    passwordForm: $('passwordForm'),
    adminCurrent: $('adminCurrent'),
    adminNew: $('adminNew'),
    adminConfirm: $('adminConfirm'),
    adminError: $('adminError'),
    adminSubmit: $('adminSubmit'),
    adminRemovePassword: $('adminRemovePassword'),
    adminRemoveError: $('adminRemoveError'),
    adminRemoveBtn: $('adminRemoveBtn'),
    searchInput: $('searchInput'),
    sortSelect: $('sortSelect'),
    listControls: $('listControls'),
    searchBanner: $('searchBanner'),
    searchBannerText: $('searchBannerText'),
    searchClearBtn: $('searchClearBtn'),
    refreshBtn: $('refreshBtn'),
    newFileBtn: $('newFileBtn'),
    sidebarTools: $('sidebarTools'),
    importBtn: $('importBtn'),
    exportBtn: $('exportBtn'),
    selectBtn: $('selectBtn'),
    fileInput: $('fileInput'),
    bulkBar: $('bulkBar'),
    bulkCount: $('bulkCount'),
    bulkAllBtn: $('bulkAllBtn'),
    bulkExportBtn: $('bulkExportBtn'),
    bulkDeleteBtn: $('bulkDeleteBtn'),
    bulkCancelBtn: $('bulkCancelBtn'),
    sidebar: document.querySelector('.sidebar'),
    filesList: $('filesList'),
    fileCount: $('fileCount'),
    trashCount: $('trashCount'),
    segFiles: $('segFiles'),
    segTrash: $('segTrash'),
    draftStatus: $('draftStatus'),
    historyBtn: $('historyBtn'),
    versionPanel: $('versionPanel'),
    versionList: $('versionList'),
    versionBanner: $('versionBanner'),
    versionBannerText: $('versionBannerText'),
    versionRestoreBtn: $('versionRestoreBtn'),
    versionBackBtn: $('versionBackBtn'),
    tabEdit: $('tabEdit'),
    tabView: $('tabView'),
    paneEdit: $('paneEdit'),
    paneView: $('paneView'),
    saveForm: $('saveForm'),
    filenameInput: $('filename'),
    filenameHint: $('filenameHint'),
    tagsInput: $('tagsInput'),
    tagBar: $('tagBar'),
    textContent: $('textContent'),
    counter: $('counter'),
    submitBtn: $('submitBtn'),
    cancelEditBtn: $('cancelEditBtn'),
    viewerTitle: $('viewerTitle'),
    fileViewer: $('fileViewer'),
    markdownView: $('markdownView'),
    markdownBtn: $('markdownBtn'),
    copyBtn: $('copyBtn'),
    viewEditBtn: $('viewEditBtn'),
    viewDownloadBtn: $('viewDownloadBtn'),
    toasts: $('toasts'),
    confirmBackdrop: $('confirmBackdrop'),
    confirmTitle: $('confirmTitle'),
    confirmBody: $('confirmBody'),
    confirmOk: $('confirmOk'),
    confirmCancel: $('confirmCancel'),
    conflictBackdrop: $('conflictBackdrop'),
    conflictBody: $('conflictBody'),
    conflictMine: $('conflictMine'),
    conflictTheirs: $('conflictTheirs'),
    conflictBoth: $('conflictBoth'),
    conflictCancel: $('conflictCancel')
};

const state = {
    isServerMode: false,
    csrf: '',            // issued by the server at sign-in
    files: [],
    trash: [],
    view: 'files',       // 'files' or 'trash'
    filter: '',
    sort: 'modified',    // 'modified' | 'name' | 'size'
    tagFilter: '',       // active tag chip, '' for none
    selecting: false,    // bulk-selection mode
    selected: [],        // slugs ticked while selecting
    searchResults: null, // non-null while showing content-search results
    searchQuery: '',
    selectedFile: '',
    viewedContent: '',
    editingFile: '',      // '' when creating a new file
    editingTitle: '',
    editingTags: [],
    editBaseVersion: '',  // version the editor's content started from
    viewVersion: '',      // version currently shown in the viewer
    versions: [],
    viewingVersion: '',  // stamp being previewed, '' when showing current content
    markdown: false      // viewer renders markdown rather than raw text
};
