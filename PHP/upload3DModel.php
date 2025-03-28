<?php
$uploadDir = dirname(__DIR__) . '/PHP/3D_models/';

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $file = $_FILES['file'];

    if ($file['error'] === UPLOAD_ERR_OK) {
        $filePath = $uploadDir . basename($file['name']);

        // Check if the file is a .glb file
        $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (strtolower($fileExtension) === 'glb' || strtolower($fileExtension) === 'zip') {
            if (move_uploaded_file($file['tmp_name'], $filePath)) {
                echo json_encode(['status' => 'success', 'message' => 'Model saved successfully.']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Error saving GLB file.']);
            }
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid file type. Only .glb files are allowed.']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Error uploading of the GLB file. Error code: ' . $file['error']]);
    }
} else {
    $requestMethod = $_SERVER['REQUEST_METHOD'];
    $fileIsSet = isset($_FILES['file']) ? 'true' : 'false';
    echo json_encode([
        'status' => 'error',
        'message' => 'No files uploaded'
    ]);
}
?>
