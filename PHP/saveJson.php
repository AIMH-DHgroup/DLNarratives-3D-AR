<?php
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if (!isset($_SESSION['login_user']) || !isset($_SESSION['id_user'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized.']);
        exit();
    }

    // Decode json
    $input = json_decode(file_get_contents('php://input'), true);

    // Get name and data
    $fileName = $input['fileName'] ?? 'default.json';
    $jsonData = $input['data'] ?? '';

    // Get username
    $username = stripslashes($_SESSION['login_user']);
    $username = pg_escape_string($username);

    $fileName = basename($fileName); // Remove unsafe paths

    $uploadDir = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json'. DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR;

    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $filePath = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json'. DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR . $fileName;

    // Overwrite the file
    if (file_put_contents($filePath, $jsonData)) {
        echo json_encode(["success" => true, "message" => "$fileName file overwritten successfully!"]);
    } else {
        echo json_encode(["success" => false, "message" => "Error saving the file: $fileName."]);
    }
} else echo json_encode(["success" => false, "message" => "Not supported request method."]);
