<?php
session_start();

if (!isset($_SESSION['id_user'])) {
    http_response_code(403);
    echo json_encode(['error' => 'User not logged in.']);
    exit;
}

$theme = $_SESSION['theme'] ?? 'dark';

echo json_encode(['theme' => $theme]);