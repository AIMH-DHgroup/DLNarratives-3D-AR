<?php
$uploadDir = './3D_models/';

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $file = $_FILES['file'];

    if ($file['error'] === UPLOAD_ERR_OK) {
        $filePath = getcwd() . DIRECTORY_SEPARATOR . '3D_models' . DIRECTORY_SEPARATOR . basename($file['name']);

        if (move_uploaded_file($file['tmp_name'], $filePath)) {
            echo json_encode(['status' => 'success', 'message' => 'ZIP file saved successfully.']);
        } else {
            $errorDetails = [
                'tmp_name' => $file['tmp_name'],
                'destination' => $filePath,
                'error' => error_get_last()
            ];
            echo json_encode([
                'status' => 'error',
                'message' => 'Error saving GLB file.',
                'details' => $errorDetails
            ]);
        }
    } else {
        $errorDetails = [
            'tmp_name' => $file['tmp_name'],
            'error' => error_get_last()
        ];
        echo json_encode([
            'status' => 'error',
            'message' => 'Error uploading the ZIP file.',
            'details' => $errorDetails
        ]);
    }
} else {
    $errorDetails = [
        'error' => error_get_last()
    ];
    echo json_encode([
        'status' => 'error',
        'message' => 'No files saved.',
        'details' => $errorDetails
    ]);
}
?>