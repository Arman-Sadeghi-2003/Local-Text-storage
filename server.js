const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure stored-files directory exists
const storedFilesDir = path.join(__dirname, 'stored-files');
if (!fs.existsSync(storedFilesDir)) {
    fs.mkdirSync(storedFilesDir);
}

// Save text to file
app.post('/save-text', (req, res) => {
    const { text, filename } = req.body;
    
    if (!text || !filename) {
        return res.status(400).json({ error: 'Text and filename are required' });
    }

    const sanitizedFilename = filename.replace(/[^a-z0-9_-]/gi, '_') + '.txt';
    const filePath = path.join(storedFilesDir, sanitizedFilename);

    fs.writeFile(filePath, text, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to save file' });
        }
        res.json({ success: true, filename: sanitizedFilename });
    });
});

// Get list of stored files
app.get('/files', (req, res) => {
    fs.readdir(storedFilesDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read files' });
        }
        res.json({ files: files.filter(f => f.endsWith('.txt')) });
    });
});

// Read a specific file
app.get('/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(storedFilesDir, filename);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.json({ filename, content: data });
    });
});

// Delete a file
app.delete('/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(storedFilesDir, filename);

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete file' });
        }
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
