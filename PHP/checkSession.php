<?php
session_start();

echo json_encode([
    'loggedIn' => isset($_SESSION['login_user']),
    'username' => $_SESSION['login_user'] ?? null,
    'usernameToDisplay' => $_SESSION['username_to_display'] ?? null,
    'idUser' => $_SESSION['id_user'] ?? null
]);