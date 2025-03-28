<?php

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
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
?>