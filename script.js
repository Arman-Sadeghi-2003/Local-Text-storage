// DOM elements
const saveForm = document.getElementById('saveForm');
const filenameInput = document.getElementById('filename');
const textContent = document.getElementById('textContent');
const messageDiv = document.getElementById('message');
const filesList = document.getElementById('filesList');
const fileViewer = document.getElementById('fileViewer');
const refreshBtn = document.getElementById('refreshBtn');
const modeIndicator = document.getElementById('modeIndicator');
const modeText = document.getElementById('modeText');
const copyBtn = document.getElementById('copyBtn');

// Detect mode: server or local
let isServerMode = false;
let isEditMode = false;
let currentEditingFile = '';

// Check if running on server
async function detectMode() {
    try {
        const response = await fetch('api.php?action=ping');
        if (response.ok) {
            isServerMode = true;
            modeText.textContent = '🟢 Server Mode (IIS/PHP) - Files stored on server';
            modeIndicator.className = 'mode-indicator server-mode';
        } else {
            setLocalMode();
        }
    } catch (error) {
        setLocalMode();
    }
}

function setLocalMode() {
    isServerMode = false;
    modeText.textContent = '🟡 Local Mode (Browser Only) - Files stored in browser localStorage';
    modeIndicator.className = 'mode-indicator local-mode';
}

// Show message
function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

// Save text file
saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const filename = filenameInput.value.trim();
    const text = textContent.value.trim();
    
    if (isEditMode) {
        // Update existing file
        if (isServerMode) {
            await updateFileOnServer(currentEditingFile, text);
        } else {
            updateFileInLocalStorage(currentEditingFile, text);
        }
    } else {
        // Create new file
        if (isServerMode) {
            await saveToServer(filename, text);
        } else {
            saveToLocalStorage(filename, text);
        }
    }
});

// Save to server (PHP)
async function saveToServer(filename, text) {
    try {
        const formData = new FormData();
        formData.append('action', 'save');
        formData.append('filename', filename);
        formData.append('text', text);
        
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`File "${data.filename}" saved successfully!`, 'success');
            filenameInput.value = '';
            textContent.value = '';
            loadFiles();
        } else {
            showMessage(data.error || 'Failed to save file', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Update file on server
async function updateFileOnServer(filename, text) {
    try {
        const formData = new FormData();
        formData.append('action', 'update');
        formData.append('filename', filename);
        formData.append('text', text);
        
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`File "${data.filename}" updated successfully!`, 'success');
            cancelEdit();
            loadFiles();
            viewFileFromServer(filename);
        } else {
            showMessage(data.error || 'Failed to update file', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Save to localStorage (local mode)
function saveToLocalStorage(filename, text) {
    try {
        const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, '_') + '.txt';
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        files[sanitizedFilename] = {
            content: text,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('textFiles', JSON.stringify(files));
        
        showMessage(`File "${sanitizedFilename}" saved successfully!`, 'success');
        filenameInput.value = '';
        textContent.value = '';
        loadFiles();
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Update file in localStorage
function updateFileInLocalStorage(filename, text) {
    try {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        if (files[filename]) {
            files[filename].content = text;
            files[filename].timestamp = new Date().toISOString();
            localStorage.setItem('textFiles', JSON.stringify(files));
            
            showMessage(`File "${filename}" updated successfully!`, 'success');
            cancelEdit();
            loadFiles();
            viewFileFromLocalStorage(filename);
        } else {
            showMessage('File not found', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Load files list
async function loadFiles() {
    if (isServerMode) {
        await loadFilesFromServer();
    } else {
        loadFilesFromLocalStorage();
    }
}

// Load files from server
async function loadFilesFromServer() {
    try {
        const response = await fetch('api.php?action=list');
        const data = await response.json();
        
        if (data.success) {
            displayFiles(data.files);
        } else {
            showMessage(data.error || 'Failed to load files', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Load files from localStorage
function loadFilesFromLocalStorage() {
    try {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        const fileNames = Object.keys(files);
        displayFiles(fileNames);
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Display files
function displayFiles(files) {
    if (files.length === 0) {
        filesList.innerHTML = '<p>No files saved yet.</p>';
        return;
    }
    
    filesList.innerHTML = files.map(file => `
        <div class="file-item">
            <span>${file}</span>
            <div class="file-actions">
                <button onclick="viewFile('${file}')">View</button>
                <button class="edit-btn" onclick="editFile('${file}')">Edit</button>
                <button class="download-btn" onclick="downloadFile('${file}')">Download</button>
                <button class="delete-btn" onclick="deleteFile('${file}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// Edit file
async function editFile(filename) {
    let content = '';
    
    if (isServerMode) {
        try {
            const response = await fetch(`api.php?action=read&filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (data.success) {
                content = data.content;
            } else {
                showMessage('Failed to load file for editing', 'error');
                return;
            }
        } catch (error) {
            showMessage('Error: ' + error.message, 'error');
            return;
        }
    } else {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        if (files[filename]) {
            content = files[filename].content;
        } else {
            showMessage('File not found', 'error');
            return;
        }
    }
    
    // Switch to edit mode
    isEditMode = true;
    currentEditingFile = filename;
    
    // Update form
    filenameInput.value = filename.replace('.txt', '');
    filenameInput.disabled = true;
    textContent.value = content;
    
    // Update submit button
    const submitBtn = saveForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Update File';
    submitBtn.style.background = '#ff9800';
    
    // Add cancel button if not exists
    let cancelBtn = document.getElementById('cancelEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel Edit';
        cancelBtn.style.background = '#6c757d';
        cancelBtn.onclick = cancelEdit;
        saveForm.appendChild(cancelBtn);
    }
    
    // Scroll to form
    saveForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    textContent.focus();
    
    showMessage(`Editing "${filename}"`, 'success');
}

// Cancel edit mode
function cancelEdit() {
    isEditMode = false;
    currentEditingFile = '';
    
    // Reset form
    filenameInput.value = '';
    filenameInput.disabled = false;
    textContent.value = '';
    
    // Reset submit button
    const submitBtn = saveForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Save File';
    submitBtn.style.background = '#667eea';
    
    // Remove cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.remove();
    }
}

// View file content
async function viewFile(filename) {
    if (isServerMode) {
        await viewFileFromServer(filename);
    } else {
        viewFileFromLocalStorage(filename);
    }
}

// View file from server
async function viewFileFromServer(filename) {
    try {
        const response = await fetch(`api.php?action=read&filename=${encodeURIComponent(filename)}`);
        const data = await response.json();
        
        if (data.success) {
            currentFileContent = data.content; // Store content for copying
            fileViewer.innerHTML = `<strong>File: ${data.filename}</strong><br><br>${data.content}`;
            copyBtn.style.display = 'inline-block'; // Show copy button
        } else {
            showMessage(data.error || 'Failed to load file', 'error');
            currentFileContent = ''; // Clear content
            copyBtn.style.display = 'none'; // Hide copy button
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
        currentFileContent = ''; // Clear content
        copyBtn.style.display = 'none'; // Hide copy button
    }
}

// View file from localStorage 
function viewFileFromLocalStorage(filename) {
    try {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        if (files[filename]) {
            currentFileContent = files[filename].content; // Store content for copying
            fileViewer.innerHTML = `<strong>File: ${filename}</strong><br><br>${files[filename].content}`;
            copyBtn.style.display = 'inline-block'; // Show copy button
        } else {
            showMessage('File not found', 'error');
            currentFileContent = ''; // Clear content
            copyBtn.style.display = 'none'; // Hide copy button
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
        currentFileContent = ''; // Clear content
        copyBtn.style.display = 'none'; // Hide copy button
    }
}

// Download file
async function downloadFile(filename) {
    let content = '';
    
    if (isServerMode) {
        try {
            const response = await fetch(`api.php?action=read&filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (data.success) {
                content = data.content;
            } else {
                showMessage('Failed to download file', 'error');
                return;
            }
        } catch (error) {
            showMessage('Error: ' + error.message, 'error');
            return;
        }
    } else {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        if (files[filename]) {
            content = files[filename].content;
        } else {
            showMessage('File not found', 'error');
            return;
        }
    }
    
    // Create download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    if (isServerMode) {
        await deleteFileFromServer(filename);
    } else {
        deleteFileFromLocalStorage(filename);
    }
}

// Delete file from server
async function deleteFileFromServer(filename) {
    try {
        const formData = new FormData();
        formData.append('action', 'delete');
        formData.append('filename', filename);
        
        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`File "${filename}" deleted successfully!`, 'success');
            loadFiles();
            fileViewer.textContent = 'Select a file to view its content';
            currentFileContent = ''; // Clear content
            copyBtn.style.display = 'none'; // Hide copy button
        } else {
            showMessage(data.error || 'Failed to delete file', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Delete file from localStorage
function deleteFileFromLocalStorage(filename) {
    try {
        const files = JSON.parse(localStorage.getItem('textFiles') || '{}');
        delete files[filename];
        localStorage.setItem('textFiles', JSON.stringify(files));
        
        showMessage(`File "${filename}" deleted successfully!`, 'success');
        loadFiles();
        fileViewer.textContent = 'Select a file to view its content';
        currentFileContent = ''; // Clear content
        copyBtn.style.display = 'none'; // Hide copy button
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// Copy file content to clipboard
copyBtn.addEventListener('click', async () => {
    if (!currentFileContent) {
        showMessage('No content to copy', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentFileContent);
        
        // Visual feedback
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓ Copied!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '#667eea';
        }, 2000);
        
        showMessage('Content copied to clipboard!', 'success');
    } catch (error) {
        // Fallback for older browsers
        fallbackCopyToClipboard(currentFileContent);
    }
});

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        document.execCommand('copy');
        
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓ Copied!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '#667eea';
        }, 2000);
        
        showMessage('Content copied to clipboard!', 'success');
    } catch (error) {
        showMessage('Failed to copy content', 'error');
    }
    
    document.body.removeChild(textArea);
}

// Refresh button
refreshBtn.addEventListener('click', loadFiles);

// Initialize
detectMode().then(() => {
    loadFiles();
});
