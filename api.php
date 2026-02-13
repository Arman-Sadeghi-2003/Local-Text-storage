<?php
header('Content-Type: application/json');

// Directory to store files - using 'datasets' folder
$storedFilesDir = __DIR__ . '/datasets';

// Create directory if it doesn't exist
if (!file_exists($storedFilesDir)) {
    mkdir($storedFilesDir, 0755, true);
}

// Sanitize filename
function sanitizeFilename($filename) {
    $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $filename);
    return $filename . '.txt';
}

// Handle different actions
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'ping':
        // Just to check if server is available
        echo json_encode(['success' => true]);
        break;
        
    case 'save':
        $filename = $_POST['filename'] ?? '';
        $text = $_POST['text'] ?? '';
        
        if (empty($filename) || empty($text)) {
            echo json_encode(['success' => false, 'error' => 'Filename and text are required']);
            exit;
        }
        
        $sanitizedFilename = sanitizeFilename($filename);
        $filePath = $storedFilesDir . '/' . $sanitizedFilename;
        
        if (file_put_contents($filePath, $text) !== false) {
            echo json_encode(['success' => true, 'filename' => $sanitizedFilename]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to save file']);
        }
        break;
        
    case 'update':
        // NEW: Update existing file
        $filename = $_POST['filename'] ?? '';
        $text = $_POST['text'] ?? '';
        
        if (empty($filename) || empty($text)) {
            echo json_encode(['success' => false, 'error' => 'Filename and text are required']);
            exit;
        }
        
        $filePath = $storedFilesDir . '/' . basename($filename);
        
        if (!file_exists($filePath)) {
            echo json_encode(['success' => false, 'error' => 'File not found']);
            exit;
        }
        
        if (file_put_contents($filePath, $text) !== false) {
            echo json_encode(['success' => true, 'filename' => $filename]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to update file']);
        }
        break;
        
    case 'list':
        if (!file_exists($storedFilesDir)) {
            echo json_encode(['success' => true, 'files' => []]);
            exit;
        }
        
        $files = array_diff(scandir($storedFilesDir), ['.', '..']);
        $txtFiles = array_values(array_filter($files, function($file) {
            return pathinfo($file, PATHINFO_EXTENSION) === 'txt';
        }));
        
        echo json_encode(['success' => true, 'files' => $txtFiles]);
        break;
        
    case 'read':
        $filename = $_GET['filename'] ?? '';
        
        if (empty($filename)) {
            echo json_encode(['success' => false, 'error' => 'Filename is required']);
            exit;
        }
        
        $filePath = $storedFilesDir . '/' . basename($filename);
        
        if (!file_exists($filePath)) {
            echo json_encode(['success' => false, 'error' => 'File not found']);
            exit;
        }
        
        $content = file_get_contents($filePath);
        echo json_encode(['success' => true, 'filename' => $filename, 'content' => $content]);
        break;
        
    case 'delete':
        $filename = $_POST['filename'] ?? '';
        
        if (empty($filename)) {
            echo json_encode(['success' => false, 'error' => 'Filename is required']);
            exit;
        }
        
        $filePath = $storedFilesDir . '/' . basename($filename);
        
        if (!file_exists($filePath)) {
            echo json_encode(['success' => false, 'error' => 'File not found']);
            exit;
        }
        
        if (unlink($filePath)) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to delete file']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>
