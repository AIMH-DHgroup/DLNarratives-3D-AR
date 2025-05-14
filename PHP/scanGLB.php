<?php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if (!isset($_SESSION['login_user']) || !isset($_SESSION['id_user'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized.']);
        exit();
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'];
    $username = stripslashes($username);
    $username = pg_escape_string($username);

    $directory = './3D_models/' . $username . DIRECTORY_SEPARATOR;

    if (!is_dir($directory)) {
        echo json_encode(['success' => true, 'array' => []]);
        exit;
    }

    $files = scandir($directory);

    $glbFiles = array_filter($files, function($file) use ($directory) {
        return (pathinfo($file, PATHINFO_EXTENSION) === 'glb' || pathinfo($file, PATHINFO_EXTENSION) === 'zip') && is_file($directory . $file);
    });

    echo json_encode(['success' => true, 'array' => array_values($glbFiles)]);

} else {
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
}