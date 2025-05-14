<?php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if (!isset($_POST['username']) || !isset($_FILES['file'])) {
        echo json_encode(['status' => 'error', 'message' => 'Missing username or file.']);
        exit;
    }

    if (!isset($_SESSION['login_user']) || !isset($_SESSION['id_user'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized.']);
        exit();
    }

    $username = stripslashes($_POST['username']);
    $username = pg_escape_string($username);

    $uploadDir = dirname(__DIR__) . '/PHP/3D_models/' . $username . DIRECTORY_SEPARATOR;

    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $file = $_FILES['file'];

    if ($file['error'] === UPLOAD_ERR_OK) {
        $filePath = $uploadDir . basename($file['name']);

        // Check if the file is a .glb or .zip file
        $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (in_array($fileExtension, ['glb', 'zip'])) {
            if (move_uploaded_file($file['tmp_name'], $filePath)) {
                echo json_encode(['status' => 'success', 'message' => 'Model saved successfully.']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Error saving the file.']);
            }
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Invalid file type. Only .glb or .zip allowed.']);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'File upload error.', 'code' => $file['error']]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
}