<?php
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if (!isset($_SESSION['login_user']) || !isset($_SESSION['id_user'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized.']);
        exit();
    }

	$filePath = $_POST['filePath'];

	if (file_exists($filePath)) {
		$unlinkResult = unlink($filePath);
		if ($unlinkResult) {
			echo json_encode(['status' => 'success', 'message' => '.glb file removed successfully.']);
		} else {
			echo json_encode(['status' => 'error', 'message' => 'Failed to remove the .glb file.']);
		}
	} else {
		echo json_encode(['status' => 'error', 'message' => 'File does not exist.']);
	}
} else {
	echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
}